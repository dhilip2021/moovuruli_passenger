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
  Modal,
  Text,
  TouchableOpacity,
} from 'react-native';

import MapView, { Marker, AnimatedRegion } from 'react-native-maps';
import Geolocation from 'react-native-geolocation-service';
import io from 'socket.io-client';
import MapViewDirections from 'react-native-maps-directions';

const SOCKET = 'https://socket-server-3kjo.onrender.com';

const GOOGLE_KEY = 'AIzaSyBQs0fTyyb9p_E8pAMZeVFt1h43kOqms2A';

const snapToRoad = async (lat, lng) => {
  try {
    const url = `https://roads.googleapis.com/v1/snapToRoads?path=${lat},${lng}&key=${GOOGLE_KEY}`;

    const res = await fetch(url);
    const data = await res.json();
    console.log(data, 'response data');
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
  const [rideRequest, setRideRequest] = useState(null);
  const [showRideModal, setShowRideModal] = useState(false);
  const [activeRide, setActiveRide] = useState(null);

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

  const startRideFlow = ride => {
    console.log('RideRequest FULL:', JSON.stringify(rideRequest, null, 2));
    console.log(ride, '<<<< RIDEEEE');
    setActiveRide({
      pickup: ride.pickup,
      drop: ride.drop,
      passengerSocketId: ride.passengerSocketId, // ✅ ADD THIS
      status: 'going_to_pickup',
    });
  };

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
      // ✅ ADD THIS HERE
      socketRef.current.on('ride-request', data => {
        console.log('Incoming ride request:', data);
        setRideRequest(data);
        setShowRideModal(true);
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
            name: 'Dhilip', // 🔥 dynamic later
            phone: '8870847064',
            vehicleNumber: 'TN 41 BD 6201',
            photo: 'https://i.pravatar.cc/150?img=12',
            latitude,
            longitude,
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
            name: 'Dhilip',
            phone: '8870847064',
            vehicleNumber: 'TN 41 BD 6201',
            photo: 'https://i.pravatar.cc/150?img=12',
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

  useEffect(() => {
    if (activeRide?.status === 'trip_completed') {
      setTimeout(() => {
        setActiveRide(null);
      }, 2000); // optional delay
    }
  }, [activeRide]);
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
          {activeRide &&
            activeRide.pickup &&
            activeRide.drop &&
            currentLocation && (
              <MapViewDirections
                origin={currentLocation}
                destination={
                  activeRide.status === 'going_to_pickup'
                    ? activeRide.pickup
                    : activeRide.drop
                }
                apikey={GOOGLE_KEY}
                strokeWidth={5}
                strokeColor="blue"
              />
            )}
          {activeRide && activeRide.status === 'going_to_pickup' && (
            <TouchableOpacity
              style={{
                position: 'absolute',
                bottom: 40,
                alignSelf: 'center',
                backgroundColor: 'green',
                padding: 12,
                borderRadius: 10,
              }}
              onPress={() => {
                if (!activeRide?.passengerSocketId) return;

                setActiveRide({
                  ...activeRide,
                  status: 'trip_started',
                });

                socketRef.current.emit('ride-status', {
                  passengerSocketId: activeRide.passengerSocketId, // ✅ FIXED
                  status: 'trip_started',
                });
              }}
            >
              <Text style={{ color: 'white' }}>Reached Pickup</Text>
            </TouchableOpacity>
          )}
          {activeRide && activeRide.status === 'trip_started' && (
            <TouchableOpacity
              style={{
                position: 'absolute',
                bottom: 40,
                alignSelf: 'center',
                backgroundColor: 'black',
                padding: 12,
                borderRadius: 10,
              }}
              onPress={() => {
                if (!activeRide?.passengerSocketId) return;

                setActiveRide({
                  ...activeRide,
                  status: 'trip_completed',
                });

                socketRef.current.emit('ride-status', {
                  passengerSocketId: activeRide.passengerSocketId, // ✅ FIXED
                  status: 'trip_completed',
                });
              }}
            >
              <Text style={{ color: 'white' }}>End Trip</Text>
            </TouchableOpacity>
          )}
        </MapView>
      )}

      <Modal visible={showRideModal} transparent animationType="slide">
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <View
            style={{
              width: '85%',
              backgroundColor: 'white',
              borderRadius: 15,
              padding: 20,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: 'bold' }}>
              🚕 New Ride Request
            </Text>

            <Text style={{ marginTop: 10 }}>
              Pickup: {rideRequest?.pickup?.latitude?.toFixed(4)},{' '}
              {rideRequest?.pickup?.longitude?.toFixed(4)}
            </Text>

            <Text style={{ marginTop: 5 }}>
              Drop: {rideRequest?.drop?.latitude?.toFixed(4)},{' '}
              {rideRequest?.drop?.longitude?.toFixed(4)}
            </Text>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginTop: 20,
              }}
            >
              <TouchableOpacity
                style={{
                  backgroundColor: 'red',
                  padding: 10,
                  borderRadius: 10,
                }}
                onPress={() => setShowRideModal(false)}
              >
                <Text style={{ color: 'white' }}>Decline</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  backgroundColor: 'green',
                  padding: 10,
                  borderRadius: 10,
                }}
                onPress={() => {
                  if (
                    !rideRequest ||
                    !rideRequest.passengerSocketId ||
                    !rideRequest.pickup ||
                    !rideRequest.drop
                  ) {
                    console.log('Invalid rideRequest', rideRequest);
                    return;
                  }

                  socketRef.current.emit('accept-ride', {
                    driverId,
                    phone: '8870847064',
                    passengerSocketId: rideRequest.passengerSocketId,
                    latitude: currentLocation?.latitude,
                    longitude: currentLocation?.longitude,
                  });
                  const formattedRide = {
                    ...rideRequest,
                    pickup: {
                      latitude: rideRequest.pickup.lat,
                      longitude: rideRequest.pickup.lng,
                    },
                    drop: {
                      latitude: rideRequest.drop.lat,
                      longitude: rideRequest.drop.lng,
                    },
                  };
                  startRideFlow(formattedRide);
                  setRideRequest(null);
                  setShowRideModal(false);
                }}
              >
                <Text style={{ color: 'white' }}>Accept</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        {rideRequest && (
          <>
            <Text>Pickup: {rideRequest.pickup?.latitude?.toFixed(4)}, ...</Text>
          </>
        )}
      </Modal>
    </View>
  );
}
