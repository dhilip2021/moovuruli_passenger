/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-native/no-inline-styles */

import React, { useEffect, useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  PermissionsAndroid,
  Platform,
  Image,
  Alert,
  Animated,
} from 'react-native';

import MapView, { Marker, AnimatedRegion } from 'react-native-maps';
import Geolocation from 'react-native-geolocation-service';
import io from 'socket.io-client';

const SOCKET = 'https://socket-server-3kjo.onrender.com';

const GOOGLE_KEY = 'AIzaSyBo0Sm8o4iWEeXnjjTGDO2v6N8_7R3m2gI';

const snapToRoad = async (lat, lng) => {
  try {
    const url = `https://roads.googleapis.com/v1/snapToRoads?path=${lat},${lng}&key=${GOOGLE_KEY}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.snappedPoints && data.snappedPoints.length > 0) {
      const point = data.snappedPoints[0].location;

      return {
        latitude: point.latitude,
        longitude: point.longitude,
      };
    }

    return { latitude: lat, longitude: lng };
  } catch (err) {
    console.log('Snap error:', err);
    return { latitude: lat, longitude: lng };
  }
};

export default function DriverMap() {
  const socketRef = useRef(null);
  const watchId = useRef(null);
  const mapRef = useRef(null);
  const [driverId, setDriverId] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);

  // 🔥 DRIVER ID
  // const driverId = useRef(
  //   'driver_' + Math.floor(Math.random() * 10000),
  // ).current;

  // 🔥 SMOOTH MARKER
  const driverLocation = useRef(
    new AnimatedRegion({
      latitude: 0,
      longitude: 0,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }),
  ).current;

  // 🔥 ROTATION ANIMATION
  const headingAnim = useRef(new Animated.Value(0)).current;

  const rotate = headingAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  // 🔥 PREVIOUS LOCATION (FOR FILTER)
  const prevLocation = useRef(null);

  useEffect(() => {
    if (!driverId) return; // 🔥 WAIT
    const init = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          console.log('Location permission denied');
          return;
        }
      }

      // SOCKET CONNECT
      socketRef.current = io(SOCKET, {
        transports: ['websocket'],
      });

      // INITIAL LOCATION
      Geolocation.getCurrentPosition(
        position => {
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;

          const location = { latitude, longitude };

          setCurrentLocation(location);
          prevLocation.current = location;

          driverLocation
            .timing({
              latitude,
              longitude,
              duration: 500,
              useNativeDriver: false,
            })
            .start();

          // DRIVER ONLINE
          socketRef.current.emit('driver-online', {
            driverId,
            latitude,
            longitude,
            phone: '9876543210',
          });

          // MAP CENTER
          if (mapRef.current) {
            mapRef.current.animateToRegion(
              {
                latitude,
                longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              },
              1000,
            );
          }
        },
        error => console.log(error),
        { enableHighAccuracy: true },
      );

      // 🔥 LIVE TRACKING
      watchId.current = Geolocation.watchPosition(
        async position => {
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;

          // const newLocation = { latitude, longitude };
          const snappedLocation = await snapToRoad(latitude, longitude);
          const newLocation = snappedLocation;

          // 🔥 FILTER SMALL GPS NOISE
          if (prevLocation.current) {
            const latDiff = Math.abs(prevLocation.current.latitude - latitude);
            const lngDiff = Math.abs(
              prevLocation.current.longitude - longitude,
            );

            if (latDiff < 0.00005 && lngDiff < 0.00005) {
              return;
            }
          }

          prevLocation.current = newLocation;

          setCurrentLocation(newLocation);

          // 🔥 SMOOTH MARKER
          driverLocation
            .timing({
              latitude,
              longitude,
              duration: 800,
              useNativeDriver: false,
            })
            .start();

          // 🔥 SMOOTH ROTATION
          if (position.coords.heading !== null) {
            Animated.timing(headingAnim, {
              toValue: position.coords.heading,
              duration: 500,
              useNativeDriver: false,
            }).start();
          }

          // 🔥 SEND TO SERVER
          socketRef.current.emit('driver-location', {
            driverId,
            latitude,
            longitude,
          });

          // 🔥 SMOOTH CAMERA FOLLOW (UBER STYLE)
          if (mapRef.current) {
            mapRef.current.animateCamera(
              {
                center: newLocation,
                pitch: 45,
                heading: position.coords.heading || 0,
                zoom: 18,
              },
              { duration: 1000 },
            );
          }
        },
        error => console.log(error),
        {
          enableHighAccuracy: true,
          distanceFilter: 3,
          interval: 2000,
          fastestInterval: 1500,
        },
      );
    };

    init();

    return () => {
      if (watchId.current) Geolocation.clearWatch(watchId.current);
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [driverId]);

  // 🔥 RIDE REQUEST HANDLER
  useEffect(() => {
    if (!socketRef.current) return;
    socketRef.current.on('ride-request', data => {
      if (data.driverId !== driverId) return;

      Alert.alert(
        'New Ride Request',
        'Do you want to accept this ride?',
        [
          { text: 'Decline', style: 'cancel' },
          {
            text: 'Accept',
            onPress: () => {
              socketRef.current.emit('accept-ride', {
                driverId,
                phone: '9876543210',
                passengerSocketId: data.passengerSocketId,
              });
            },
          },
        ],
        { cancelable: true },
      );
    });

    return () => {
      socketRef.current.off('ride-request');
    };
  }, []);

  useEffect(() => {
    const loadDriverId = async () => {
      try {
        let storedId = await AsyncStorage.getItem('driverId');

        if (!storedId) {
          // FIRST TIME → CREATE ID
          storedId = 'driver_' + Math.floor(Math.random() * 1000000);

          await AsyncStorage.setItem('driverId', storedId);
          console.log('New Driver ID Created:', storedId);
        } else {
          console.log('Existing Driver ID:', storedId);
        }

        setDriverId(storedId);
      } catch (err) {
        console.log('DriverId error:', err);
      }
    };

    loadDriverId();
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {currentLocation && (
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          initialRegion={{
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
        >
          <Marker.Animated
            coordinate={driverLocation}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <Animated.Image
              source={require('../assets/images/autorickshaw.png')}
              style={{
                width: 35,
                height: 35,
                transform: [{ rotate }],
              }}
            />
          </Marker.Animated>
        </MapView>
      )}
    </View>
  );
}
