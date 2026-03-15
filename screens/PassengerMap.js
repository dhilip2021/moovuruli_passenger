/* eslint-disable react-native/no-inline-styles */

import React, { useEffect, useState, useRef } from 'react';
import { View, Button, PermissionsAndroid } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import io from 'socket.io-client';

export default function PassengerMap() {
  const socketRef = useRef(null);

  const [driverLocation, setDriverLocation] = useState(null);

  const requestRide = () => {
    if (!socketRef.current) return;

    socketRef.current.emit('request-ride', {
      passengerSocketId: socketRef.current.id,
      latitude: 13.0827,
      longitude: 80.2707,
    });
  };

  useEffect(() => {
    const requestPermission = async () => {
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
    };

    requestPermission();

    socketRef.current = io('https://socket-server-3kjo.onrender.com', {
      transports: ['websocket'],
      timeout: 20000,
    });

    socketRef.current.on('connect', () => {
      console.log('Socket connected');
    });

    socketRef.current.on('driver-location', data => {
      setDriverLocation({
        latitude: data.latitude,
        longitude: data.longitude,
      });
    });

    socketRef.current.on('ride-accepted', data => {
      console.log('Ride Accepted', data);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  return (
    

    <View style={{ flex: 1 }}>
      <MapView
        style={{ flex: 1 }}
        provider="google"
        initialRegion={{
          latitude: 13.0827,
          longitude: 80.2707,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        {driverLocation && <Marker coordinate={driverLocation} />}
      </MapView>

      <View
        style={{
          position: 'absolute',
          bottom: 40,
          alignSelf: 'center',
        }}
      >
        <Button title="Request Ride" onPress={requestRide} />
      </View>
    </View>
  );
}
