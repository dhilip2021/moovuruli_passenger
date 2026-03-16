/* eslint-disable react-native/no-inline-styles */

import React, { useEffect, useState, useRef } from "react";
import { View, Button, PermissionsAndroid, Platform, Text } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import Geolocation from "react-native-geolocation-service";
import MapViewDirections from "react-native-maps-directions";
import io from "socket.io-client";

const GOOGLE_MAPS_APIKEY = "AIzaSyBo0Sm8o4iWEeXnjjTGDO2v6N8_7R3m2gI";

export default function PassengerMap1() {

  const socketRef = useRef(null);
  const mapRef = useRef(null);
  const watchId = useRef(null);

  const [driverLocation, setDriverLocation] = useState(null);
  const [passengerLocation, setPassengerLocation] = useState(null);
  const [dropLocation, setDropLocation] = useState(null);

  const [distance, setDistance] = useState(null);
  const [duration, setDuration] = useState(null);

  // request ride
  const requestRide = () => {

    if (!socketRef.current || !passengerLocation) return;

    socketRef.current.emit("request-ride", {
      passengerSocketId: socketRef.current.id,
      latitude: passengerLocation.latitude,
      longitude: passengerLocation.longitude
    });

  };

  useEffect(() => {

    const init = async () => {

      // permission
      if (Platform.OS === "android") {

        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          console.log("Location denied");
          return;
        }
      }

      // watch passenger location
      watchId.current = Geolocation.watchPosition(
        position => {

          const { latitude, longitude } = position.coords;

          const location = { latitude, longitude };

          setPassengerLocation(location);

          if (mapRef.current) {

            mapRef.current.animateCamera({
              center: location
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

      // socket connect
      socketRef.current = io("https://socket-server-3kjo.onrender.com", {
        transports: ["websocket"]
      });

      socketRef.current.on("connect", () => {
        console.log("Socket:", socketRef.current.id);
      });

      // driver location realtime
      socketRef.current.on("driver-location", data => {

        const location = {
          latitude: Number(data.latitude),
          longitude: Number(data.longitude)
        };

        setDriverLocation(location);

      });

    };


    init();

    return () => {

      if (watchId.current) Geolocation.clearWatch(watchId.current);
      if (socketRef.current) socketRef.current.disconnect();

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
        onPress={(e) => {

          // user tap = drop location
          setDropLocation(e.nativeEvent.coordinate);

        }}
      >

        {/* passenger marker */}
        {passengerLocation && (
          <Marker
            coordinate={passengerLocation}
            title="Pickup"
            pinColor="blue"
          />
        )}

        {/* drop marker */}
        {dropLocation && (
          <Marker
            coordinate={dropLocation}
            title="Drop"
            pinColor="red"
          />
        )}

        {/* driver marker */}
        {driverLocation && (
          <Marker
            coordinate={driverLocation}
            title="Driver"
            pinColor="green"
          />
        )}

        {/* route line */}
        {passengerLocation && dropLocation && (
          <MapViewDirections
            origin={passengerLocation}
            destination={dropLocation}
            apikey={GOOGLE_MAPS_APIKEY}
            strokeWidth={5}
            strokeColor="black"
            onReady={(result) => {

              setDistance(result.distance);
              setDuration(result.duration);

              mapRef.current.fitToCoordinates(result.coordinates, {
                edgePadding: {
                  right: 50,
                  left: 50,
                  top: 50,
                  bottom: 50
                }
              });

            }}
          />
        )}

      </MapView>

      {/* ride button */}
      <View
        style={{
          position: "absolute",
          bottom: 40,
          alignSelf: "center"
        }}
      >

        <Button title="Request Ride" onPress={requestRide} />

      </View>

      {/* ETA */}
      {distance && duration && (
        <View
          style={{
            position: "absolute",
            top: 50,
            alignSelf: "center",
            backgroundColor: "white",
            padding: 10,
            borderRadius: 10
          }}
        >

          <Text>Distance: {distance.toFixed(2)} km</Text>
          <Text>ETA: {Math.ceil(duration)} mins</Text>

        </View>
      )}

    </View>

  );

}