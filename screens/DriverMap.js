/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-native/no-inline-styles */

import React, { useEffect, useState, useRef } from "react";
import { View, PermissionsAndroid, Platform, Image, Alert } from "react-native";

import MapView, { Marker, AnimatedRegion } from "react-native-maps";
import Geolocation from "react-native-geolocation-service";
import io from "socket.io-client";

const SOCKET = "https://socket-server-3kjo.onrender.com";

export default function DriverMap() {
  const socketRef = useRef(null);
  const watchId = useRef(null);
  const mapRef = useRef(null);

  const [currentLocation, setCurrentLocation] = useState(null);
  const [heading, setHeading] = useState(0);

  // Generate driverId once
  const driverId = useRef("driver_" + Math.floor(Math.random() * 10000)).current;

  const driverLocation = useRef(
    new AnimatedRegion({
      latitude: 0,
      longitude: 0,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    })
  ).current;

  // Initialize location + socket
  useEffect(() => {
    const init = async () => {
      if (Platform.OS === "android") {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          console.log("Location permission denied");
          return;
        }
      }

      // CONNECT SOCKET
      socketRef.current = io(SOCKET, { transports: ["websocket"] });

      // GET CURRENT LOCATION
      Geolocation.getCurrentPosition(
        (position) => {
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;

          const location = { latitude, longitude };
          setCurrentLocation(location);

          driverLocation.timing({ latitude, longitude, duration: 500 }).start();

          // DRIVER ONLINE EVENT
          socketRef.current.emit("driver-online", {
            driverId,
            latitude,
            longitude,
            phone: "9876543210",
          });

          // AUTO ZOOM MAP
          if (mapRef.current) {
            mapRef.current.animateToRegion(
              { latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 },
              1000
            );
          }
        },
        (error) => console.log(error),
        { enableHighAccuracy: true }
      );

      // LIVE LOCATION TRACK
      watchId.current = Geolocation.watchPosition(
        (position) => {
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;

          const newLocation = { latitude, longitude };
          setCurrentLocation(newLocation);

          if (position.coords.heading !== null) setHeading(position.coords.heading);

          driverLocation.timing({ latitude, longitude, duration: 1000 }).start();

          // EMIT LOCATION TO SERVER
          socketRef.current.emit("driver-location", { driverId, latitude, longitude });

          // FOLLOW DRIVER
          if (mapRef.current) {
            mapRef.current.animateCamera({
              center: newLocation,
              zoom: 17,
              heading: position.coords.heading || 0,
            });
          }
        },
        (error) => console.log(error),
        {
          enableHighAccuracy: true,
          distanceFilter: 5,
          interval: 3000,
          fastestInterval: 2000,
        }
      );
    };

    init();

    return () => {
      if (watchId.current) Geolocation.clearWatch(watchId.current);
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  // HANDLE RIDE REQUEST FROM PASSENGER
  useEffect(() => {
    if (!socketRef.current) return;

    socketRef.current.on("ride-request", (data) => {
      // data: { passengerSocketId, latitude, longitude }
      Alert.alert(
        "New Ride Request",
        "Do you want to accept this ride?",
        [
          {
            text: "Decline",
            style: "cancel",
          },
          {
            text: "Accept",
            onPress: () => {
              // ACCEPT RIDE
              socketRef.current.emit("accept-ride", {
                driverId,
                phone: "9876543210",
                passengerSocketId: data.passengerSocketId,
              });
            },
          },
        ],
        { cancelable: true }
      );
    });

    return () => {
      socketRef.current.off("ride-request");
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {currentLocation && (
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          region={{
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
        >
          <Marker.Animated coordinate={driverLocation} anchor={{ x: 0.5, y: 0.5 }}>
            <Image
              source={require("../assets/images/autorickshaw.png")}
              style={{
                width: 35,
                height: 35,
                transform: [{ rotate: `${heading}deg` }],
              }}
            />
          </Marker.Animated>
        </MapView>
      )}
    </View>
  );
}