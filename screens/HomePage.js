/* eslint-disable react-native/no-inline-styles */

import React from "react";
import { View, Text, TouchableOpacity } from "react-native";

export default function HomePage({ navigation }) {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >

      <Text style={{ fontSize: 26, marginBottom: 40 }}>
        Choose Mode
      </Text>

      <TouchableOpacity
        onPress={() => navigation.navigate("Passenger")}
        style={{
          backgroundColor: "black",
          padding: 15,
          borderRadius: 10,
          width: 200,
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <Text style={{ color: "white", fontSize: 18 }}>
          Passenger
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => navigation.navigate("Driver")}
        style={{
          backgroundColor: "green",
          padding: 15,
          borderRadius: 10,
          width: 200,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "white", fontSize: 18 }}>
          Driver
        </Text>
      </TouchableOpacity>

    </View>
  );
}