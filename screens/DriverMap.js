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
  TextInput,
} from 'react-native';

import MapView, { Marker, AnimatedRegion } from 'react-native-maps';
import Geolocation from 'react-native-geolocation-service';
import io from 'socket.io-client';
import MapViewDirections from 'react-native-maps-directions';
import Toast from 'react-native-toast-message';

const SOCKET = 'https://socket-server-3kjo.onrender.com';

const GOOGLE_KEY = 'AIzaSyBQs0fTyyb9p_E8pAMZeVFt1h43kOqms2A';

const showToast = (message, type) => {
  Toast.show({
    type: type,
    text1: message,
    position: 'top',
  });
};

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
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
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
  const [enteredOtp, setEnteredOtp] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMode, setPaymentMode] = useState(null);

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
    if (!ride?.pickup || !ride?.drop) {
      console.log('Invalid ride data ❌', ride);
      return;
    }

    setActiveRide({
      pickup: {
        latitude: ride.pickup.latitude,
        longitude: ride.pickup.longitude,
        address: ride.pickup.address || 'Pickup Location', // ✅ fallback
      },
      drop: {
        latitude: ride.drop.latitude,
        longitude: ride.drop.longitude,
        address: ride.drop.address || 'Drop Location', // ✅ fallback
      },
      passengerSocketId: ride.passengerSocketId,
      status: 'going_to_pickup',
      fare: ride.fare, // ✅ STORE
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

      socketRef.current.on('ride-cancelled', data => {
        console.log('Passenger cancelled ride ❌');

        setActiveRide(null);
        setRideRequest(null);
        setShowRideModal(false);

        showToast('Passenger cancelled the ride ❌', 'error');
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
          // if (mapRef.current) {
          //   mapRef.current.animateToRegion(
          //     {
          //       latitude,
          //       longitude,
          //       latitudeDelta: 0.01,
          //       longitudeDelta: 0.01,
          //     },
          //     1000,
          //   );
          // }
          if (mapRef.current && currentLocation) {
            mapRef.current.animateToRegion({
              latitude: currentLocation.latitude,
              longitude: currentLocation.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            });
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

      socketRef.current.on('otp-success', () => {
        setActiveRide(prev => ({
          ...prev,
          status: 'trip_started',
        }));
      });

      socketRef.current.on('otp-failed', () => {
        showToast('Wrong OTP ❌', 'error');
      });
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

  useEffect(() => {
    if (!activeRide || !currentLocation || !activeRide.pickup) return;

    const distanceToPickup = getDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      activeRide.pickup.latitude,
      activeRide.pickup.longitude,
    );

    console.log('Distance to pickup:', distanceToPickup);

    // 🔥 If driver reached within 50 meters
    if (
      distanceToPickup < 0.05 && // 50 meters
      activeRide.status === 'going_to_pickup'
    ) {
      setActiveRide(prev => ({
        ...prev,
        status: 'reached_pickup',
      }));

      showToast('You reached pickup location 📍', 'success');
    }
  }, [currentLocation, activeRide]);

  useEffect(() => {
    if (!socketRef.current) return;

    socketRef.current.on('trip-ended', data => {
      setActiveRide(null);

      showToast(
        `Trip Completed via ${data?.paymentMode || 'cash'} 💰`,
        'success',
      );
    });

    return () => {
      socketRef.current?.off('trip-ended');
    };
  }, []);

  const fare = rideRequest?.fare || 0;

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

          {/* 📍 PICKUP MARKER */}
          {activeRide?.pickup && (
            <Marker coordinate={activeRide.pickup}>
              <Image
                source={require('../assets/images/pickuppin.png')} // or any icon
                style={{ width: 30, height: 30 }}
              />
            </Marker>
          )}

          {/* 🎯 DROP MARKER */}
          {activeRide?.drop && (
            <Marker coordinate={activeRide.drop}>
              <Image
                source={require('../assets/images/droppin.png')}
                style={{ width: 30, height: 30 }}
              />
            </Marker>
          )}

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
        </MapView>
      )}

      {activeRide && activeRide.status === 'going_to_pickup' && (
        <TouchableOpacity
          style={{
            position: 'absolute',
            bottom: 40,
            alignSelf: 'center',
            backgroundColor: '#419952',
            padding: 12,
            borderRadius: 10,
          }}
          onPress={() => {
            if (!activeRide?.passengerSocketId) return;

            setActiveRide(prev => ({
              ...prev,
              status: 'reached_pickup',
            }));

            socketRef.current.emit('ride-status', {
              passengerSocketId: activeRide.passengerSocketId, // ✅ FIXED
              status: 'reached_pickup',
            });
          }}
        >
          <Text style={{ color: 'white' }}>Reached Pickup</Text>
        </TouchableOpacity>
      )}

      {activeRide?.status === 'reached_pickup' && (
        <View
          style={{
            position: 'absolute',
            bottom: 40,
            width: '90%',
            alignSelf: 'center',
            backgroundColor: '#fff',
            padding: 18,
            borderRadius: 16,
            elevation: 10,

            // iOS shadow
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 5 },
          }}
        >
          {/* TITLE */}
          <Text
            style={{
              fontSize: 16,
              fontWeight: '700',
              textAlign: 'center',
              marginBottom: 10,
            }}
          >
            🔐 Verify Your Ride
          </Text>

          {/* SUBTEXT */}
          <Text
            style={{
              fontSize: 13,
              color: '#666',
              textAlign: 'center',
              marginBottom: 15,
            }}
          >
            Share OTP with driver to start trip
          </Text>

          {/* OTP INPUT */}
          <TextInput
            value={enteredOtp}
            onChangeText={setEnteredOtp}
            keyboardType="number-pad"
            maxLength={6}
            style={{
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 10,
              paddingVertical: 12,
              fontSize: 18,
              textAlign: 'center',
              letterSpacing: 8,
              backgroundColor: '#f9f9f9',
            }}
          />

          {/* VERIFY BUTTON */}
          <TouchableOpacity
            style={{
              backgroundColor: '#419952',
              marginTop: 15,
              paddingVertical: 12,
              borderRadius: 10,
              alignItems: 'center',
              elevation: 3,
            }}
            onPress={() => {
              if (!enteredOtp) {
                showToast('Enter OTP', 'error');
                return;
              }
              socketRef.current.emit('verify-otp', {
                passengerSocketId: activeRide.passengerSocketId,
                otp: enteredOtp,
              });
            }}
          >
            <Text
              style={{
                color: 'white',
                fontWeight: '600',
                fontSize: 15,
              }}
            >
              Verify & Start Trip
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {activeRide && activeRide.status === 'trip_started' && (
        <TouchableOpacity
          style={{
            position: 'absolute',
            bottom: 40,
            alignSelf: 'center',
            backgroundColor: '#e74c3c',
            padding: 12,
            borderRadius: 10,
          }}
          // onPress={() => {
          //   if (!activeRide?.passengerSocketId) return;
          //   setShowPaymentModal(true);
          //   socketRef.current.emit('end-trip', {
          //     passengerSocketId: activeRide.passengerSocketId,
          //   });
          // }}
          onPress={() => {
            if (!activeRide?.passengerSocketId) return;
            setShowPaymentModal(true); // ✅ ONLY THIS
          }}
        >
          <Text style={{ color: 'white' }}>End Trip</Text>
        </TouchableOpacity>
      )}

      <Modal visible={showRideModal} transparent animationType="fade">
  <View
    style={{
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
    }}
  >
    <View
      style={{
        width: '88%',
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 20,
        elevation: 12,
      }}
    >
      {/* HEADER */}
      <Text
        style={{
          fontSize: 20,
          fontWeight: '700',
          textAlign: 'center',
          marginBottom: 15,
        }}
      >
         New Ride Request
      </Text>

      {/* LOCATION CARD */}
     <View
  style={{
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 15,

    // Shadow (iOS)
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },

    // Elevation (Android)
    elevation: 6,
  }}
>
  {/* 🔹 PICKUP */}
  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
    {/* ICON */}
    <View
      style={{
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#2ecc71',
        marginRight: 10,
      }}
    />

    {/* TEXT */}
    <Text
      numberOfLines={1}
      ellipsizeMode="tail"
      style={{
        flex: 1,
        color: '#333',
        fontSize: 14,
        fontWeight: '500',
      }}
    >
      {rideRequest?.pickup?.address || 'Pickup Location'}
    </Text>
  </View>

  {/* 🔸 DIVIDER */}
  <View
    style={{
      height: 1,
      backgroundColor: '#f0f0f0',
      marginVertical: 12,
      marginLeft: 20,
    }}
  />

  {/* 🔹 DROP */}
  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
    {/* ICON */}
    <View
      style={{
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#e74c3c',
        marginRight: 10,
      }}
    />

    {/* TEXT */}
    <Text
      numberOfLines={1}
      ellipsizeMode="tail"
      style={{
        flex: 1,
        color: '#333',
        fontSize: 14,
        fontWeight: '500',
      }}
    >
      {rideRequest?.drop?.address || 'Drop Location'}
    </Text>
  </View>
</View>

      {/* FARE CARD */}
      <View
        style={{
          backgroundColor: '#E8F5E9',
          borderRadius: 12,
          padding: 12,
          marginBottom: 20,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#2e7d32', fontSize: 13 }}>
          Estimated Fare
        </Text>

        <Text
          style={{
            fontSize: 22,
            fontWeight: 'bold',
            color: '#2e7d32',
            marginTop: 5,
          }}
        >
          ₹{fare.toFixed(0)}
        </Text>
      </View>

      {/* BUTTONS */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        {/* DECLINE */}
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: '#fff',
            paddingVertical: 12,
            borderRadius: 12,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: '#e74c3c',
            marginRight: 8,
          }}
          onPress={() => {
            socketRef.current.emit('decline-ride', {
              passengerSocketId: rideRequest.passengerSocketId,
            });
            setShowRideModal(false);
          }}
        >
          <Text
            style={{
              color: '#e74c3c',
              fontWeight: '600',
            }}
          >
            Decline
          </Text>
        </TouchableOpacity>

        {/* ACCEPT */}
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: '#419952',
            paddingVertical: 12,
            borderRadius: 12,
            alignItems: 'center',
            elevation: 4,
          }}
          onPress={() => {
            socketRef.current.emit('accept-ride', {
              driverId,
              phone: '8870847064',
              passengerSocketId: rideRequest.passengerSocketId,
              latitude: currentLocation?.latitude,
              longitude: currentLocation?.longitude,
            });

            startRideFlow({
              ...rideRequest,
              fare: rideRequest.fare,
            });

            setRideRequest(null);
            setShowRideModal(false);
          }}
        >
          <Text
            style={{
              color: '#fff',
              fontWeight: '600',
            }}
          >
            Accept Ride
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  </View>
</Modal>
      <Modal visible={showPaymentModal} transparent animationType="slide">
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.5)',
          }}
        >
          <View
            style={{
              width: '80%',
              backgroundColor: '#fff',
              padding: 20,
              borderRadius: 15,
            }}
          >
            <Text
              style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 15 }}
            >
              Select Payment Method
            </Text>

            {/* CASH */}
            <TouchableOpacity
              style={{
                padding: 12,
                backgroundColor: '#eee',
                marginBottom: 10,
                borderRadius: 10,
              }}
              onPress={() => setPaymentMode('cash')}
            >
              <Text>💵 Cash</Text>
            </TouchableOpacity>

            {/* ONLINE */}
            <TouchableOpacity
              style={{ padding: 12, backgroundColor: '#eee', borderRadius: 10 }}
              onPress={() => setPaymentMode('online')}
            >
              <Text>💳 Online</Text>
            </TouchableOpacity>

            {/* CONFIRM */}
            <TouchableOpacity
              style={{
                marginTop: 15,
                backgroundColor: '#419952',
                padding: 12,
                borderRadius: 10,
                alignItems: 'center',
              }}
              onPress={() => {
                if (!paymentMode) return;

                socketRef.current.emit('end-trip', {
                  passengerSocketId: activeRide.passengerSocketId,
                  paymentMode, // ✅ SEND THIS
                });

                setShowPaymentModal(false);
              }}
            >
              <Text style={{ color: '#fff' }}>Confirm & End Trip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
