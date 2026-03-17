/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-native/no-inline-styles */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Button,
  PermissionsAndroid,
  Platform,
  Linking,
  Image,
  Alert,
} from 'react-native';

import MapView, { Marker, AnimatedRegion } from 'react-native-maps';
import Geolocation from 'react-native-geolocation-service';
import MapViewDirections from 'react-native-maps-directions';
import io from 'socket.io-client';

const GOOGLE_KEY = 'AIzaSyBo0Sm8o4iWEeXnjjTGDO2v6N8_7R3m2gI';
const SOCKET = 'https://socket-server-3kjo.onrender.com';

export default function PassengerMap() {
  const socketRef = useRef(null);
  const mapRef = useRef(null);
  const watchId = useRef(null);

  const [passengerLocation, setPassengerLocation] = useState(null);
  const [dropLocation, setDropLocation] = useState(null);
  const [driverPhone, setDriverPhone] = useState(null);
  const [distance, setDistance] = useState(null);
  const [duration, setDuration] = useState(null);
  const [drivers, setDrivers] = useState([]);

  // 🔥 MULTI DRIVER MARKERS
  const driverMarkers = useRef({});

  // 🔥 REMOVE OFFLINE DRIVERS
  useEffect(() => {
    const currentIds = drivers.map(d => d.driverId);

    Object.keys(driverMarkers.current).forEach(id => {
      if (!currentIds.includes(id)) {
        delete driverMarkers.current[id];
      }
    });
  }, [drivers]);

  useEffect(() => {
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

      // 📍 CURRENT LOCATION
      Geolocation.getCurrentPosition(
        position => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };

          setPassengerLocation(location);

          mapRef.current?.animateToRegion(
            { ...location, latitudeDelta: 0.01, longitudeDelta: 0.01 },
            1000,
          );
        },
        error => console.log(error),
        { enableHighAccuracy: true },
      );

      // 📡 LIVE LOCATION
      watchId.current = Geolocation.watchPosition(
        position => {
          setPassengerLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        error => console.log(error),
        { enableHighAccuracy: true, distanceFilter: 5, interval: 3000 },
      );

      // 🔌 SOCKET CONNECT
      socketRef.current = io(SOCKET, { transports: ['websocket'] });

      // 🚕 DRIVERS LIST (SINGLE CLEAN LISTENER)
      socketRef.current.on('drivers-list', list => {
        setDrivers(list);

        list.forEach(driver => {
          const id = driver.driverId;
          const latitude = Number(driver.latitude);
          const longitude = Number(driver.longitude);

          if (!driverMarkers.current[id]) {
            // 🔥 CREATE MARKER FIRST TIME
            driverMarkers.current[id] = new AnimatedRegion({
              latitude,
              longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            });
          } else {
            // 🔥 SMOOTH MOVE
            driverMarkers.current[id].timing({
              latitude,
              longitude,
              duration: 700,
              useNativeDriver: false,
            }).start();
          }
        });
      });

      // 📞 RIDE ACCEPTED
      socketRef.current.on('ride-accepted', data => {
        setDriverPhone(data.phone);
      });
    };

    init();

    return () => {
      if (watchId.current) Geolocation.clearWatch(watchId.current);
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  // 🚕 REQUEST RIDE
  const requestRide = driverId => {
    if (!driverId || !passengerLocation) {
      Alert.alert('Location not ready');
      return;
    }

    socketRef.current.emit('request-ride', {
      passengerSocketId: socketRef.current.id,
      latitude: passengerLocation.latitude,
      longitude: passengerLocation.longitude,
      driverId,
    });
  };

  const price = distance ? 40 + distance * 12 : 0;

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={{
          latitude: 13.0827,
          longitude: 80.2707,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        onPress={e => setDropLocation(e.nativeEvent.coordinate)}
      >
        {/* 🧍 PASSENGER */}
        {passengerLocation && (
          <Marker coordinate={passengerLocation} pinColor="blue" />
        )}

        {/* 📍 DROP */}
        {dropLocation && <Marker coordinate={dropLocation} pinColor="red" />}

        {/* 🚕 ALL DRIVERS */}
        {drivers.map(driver => {
          const marker = driverMarkers.current[driver.driverId];
          if (!marker) return null;

          return (
            <Marker.Animated
              key={driver.driverId}
              coordinate={marker}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <Image
                source={require('../assets/images/autorickshaw.png')}
                style={{ width: 40, height: 40 }}
              />
            </Marker.Animated>
          );
        })}

        {/* 🛣️ ROUTE */}
        {passengerLocation && dropLocation && (
          <MapViewDirections
            origin={passengerLocation}
            destination={dropLocation}
            apikey={GOOGLE_KEY}
            strokeWidth={5}
            strokeColor="black"
            onReady={result => {
              setDistance(result.distance);
              setDuration(result.duration);

              mapRef.current.fitToCoordinates(result.coordinates, {
                edgePadding: {
                  top: 80,
                  right: 80,
                  bottom: 80,
                  left: 80,
                },
              });
            }}
          />
        )}
      </MapView>

      {/* 🚕 DRIVER LIST BUTTON */}
      <View
        style={{
          position: 'absolute',
          bottom: 100,
          width: '90%',
          alignSelf: 'center',
          backgroundColor: 'white',
          padding: 10,
          borderRadius: 10,
        }}
      >
        {drivers.map(driver => (
          <Button
            key={driver.driverId}
            title={`Request Driver: ${driver.driverId}`}
            onPress={() => requestRide(driver.driverId)}
          />
        ))}
      </View>

      {/* 📊 TRIP INFO */}
      {distance && (
        <View
          style={{
            position: 'absolute',
            top: 60,
            alignSelf: 'center',
            backgroundColor: 'white',
            padding: 12,
            borderRadius: 10,
          }}
        >
          <Text>Distance: {distance.toFixed(2)} km</Text>
          <Text>ETA: {Math.ceil(duration)} mins</Text>
          <Text>Fare: ₹{price.toFixed(0)}</Text>

          {driverPhone && (
            <Button
              title="Call Driver"
              onPress={() => Linking.openURL(`tel:${driverPhone}`)}
            />
          )}
        </View>
      )}
    </View>
  );
}