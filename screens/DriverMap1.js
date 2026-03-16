/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-native/no-inline-styles */

import React, { useEffect, useState, useRef } from "react";
import { View, Text, Button, PermissionsAndroid, Platform } from "react-native";
import MapView, { Marker } from "react-native-maps";
import Geolocation from "react-native-geolocation-service";
import io from "socket.io-client";

const SOCKET = "https://socket-server-3kjo.onrender.com";

export default function DriverMap1() {

  const socketRef = useRef(null);
  const watchId = useRef(null);
  const mapRef = useRef(null);

  const [location, setLocation] = useState(null);
  const [ride, setRide] = useState(null);

  const driverId = "driver_" + Math.floor(Math.random() * 10000);

  useEffect(() => {

    const init = async () => {

      // LOCATION PERMISSION
      if (Platform.OS === "android") {

        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          console.log("Location permission denied");
          return;
        }

      }

      socketRef.current = io(SOCKET, {
        transports: ["websocket"]
      });

      // DRIVER LOCATION WATCH
      watchId.current = Geolocation.watchPosition(
        position => {

          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };

          setLocation(coords);

          // send realtime location to server
          socketRef.current.emit("driver-location", {
            driverId,
            latitude: coords.latitude,
            longitude: coords.longitude
          });

          // map camera move
          if (mapRef.current) {

            mapRef.current.animateCamera({
              center: coords,
              zoom: 17
            });

          }

        },
        error => console.log(error),
        {
          enableHighAccuracy: true,
          distanceFilter: 5,
          interval: 3000,
          fastestInterval: 2000
        }
      );

      // DRIVER ONLINE (FIRST LOCATION)
      Geolocation.getCurrentPosition(
        position => {

          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };

          socketRef.current.emit("driver-online", {
            driverId,
            latitude: coords.latitude,
            longitude: coords.longitude,
            phone: "9876543210"
          });

        },
        error => console.log(error),
        { enableHighAccuracy: true }
      );

      // RIDE REQUEST RECEIVE
      socketRef.current.on("ride-request", data => {

        console.log("Ride request received");
        setRide(data);

      });

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

  const acceptRide = () => {

    socketRef.current.emit("accept-ride", {
      driverId,
      passengerSocketId: ride.passengerSocketId,
      phone: "9876543210"
    });

    setRide(null);

  };

  return (

    <View style={{ flex: 1 }}>

      {location && (

        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          initialRegion={{
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01
          }}
        >

          <Marker
            coordinate={location}
            title="Driver"
            pinColor="green"
          />

        </MapView>

      )}

      {ride && (

        <View
          style={{
            position: "absolute",
            bottom: 50,
            alignSelf: "center",
            backgroundColor: "white",
            padding: 15,
            borderRadius: 10
          }}
        >

          <Text style={{ marginBottom: 10 }}>
            New Ride Request
          </Text>

          <Button
            title="Accept Ride"
            onPress={acceptRide}
          />

        </View>

      )}

    </View>

  );

}