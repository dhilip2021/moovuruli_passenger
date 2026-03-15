/* eslint-disable react-native/no-inline-styles */

import React, { useEffect, useState, useRef } from "react";
import { View, Button, PermissionsAndroid, Platform } from "react-native";
import MapView, { Marker } from "react-native-maps";
import Geolocation from "react-native-geolocation-service";
import io from "socket.io-client";

export default function PassengerMap() {
  const socketRef = useRef(null);
  const mapRef = useRef(null);
  const watchId = useRef(null);

  const [driverLocation, setDriverLocation] = useState(null);
  const [passengerLocation, setPassengerLocation] = useState(null);

  const requestRide = () => {
    if (!socketRef.current || !passengerLocation) return;

    socketRef.current.emit("request-ride", {
      passengerSocketId: socketRef.current.id,
      latitude: passengerLocation.latitude,
      longitude: passengerLocation.longitude,
    });
  };

  useEffect(() => {
    const init = async () => {
      try {
        // Permission request
        if (Platform.OS === "android") {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );

          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            console.log("Location permission denied");
            return;
          }
        }

        // Watch passenger live location
        watchId.current = Geolocation.watchPosition(
          position => {
            if (!position?.coords) return;

            const { latitude, longitude } = position.coords;

            const location = {
              latitude,
              longitude
            };

            setPassengerLocation(location);

            if (mapRef.current) {
              mapRef.current.animateToRegion({
                ...location,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01
              });
            }
          },
          error => {
            console.log("GPS ERROR:", error);
          },
          {
            enableHighAccuracy: true,
            distanceFilter: 5,
            interval: 5000,
            fastestInterval: 2000
          }
        );

        // SOCKET
        socketRef.current = io("https://socket-server-3kjo.onrender.com", {
          transports: ["websocket"]
        });

        socketRef.current.on("connect", () => {
          console.log("Socket connected:", socketRef.current.id);
        });

        socketRef.current.on("driver-location", data => {
          if (!data) return;

          const location = {
            latitude: Number(data.latitude),
            longitude: Number(data.longitude)
          };

          setDriverLocation(location);
        });

      } catch (err) {
        console.log("INIT ERROR:", err);
      }
    };

    init();

    return () => {
      if (watchId.current) {
        Geolocation.clearWatch(watchId.current);
      }

      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={{
          latitude: 13.0827,
          longitude: 80.2707,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01
        }}
      >
        {passengerLocation && (
          <Marker coordinate={passengerLocation} title="You" pinColor="blue" />
        )}

        {driverLocation && (
          <Marker coordinate={driverLocation} title="Driver" pinColor="green" />
        )}
      </MapView>

      <View
        style={{
          position: "absolute",
          bottom: 40,
          alignSelf: "center"
        }}
      >
        <Button title="Request Ride" onPress={requestRide} />
      </View>
    </View>
  );
}