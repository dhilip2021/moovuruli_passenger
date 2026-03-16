import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import HomePage from './screens/HomePage';
import PassengerMap from './screens/PassengerMap';
import DriverMap from './screens/DriverMap';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>

        <Stack.Screen
          name="Home"
          component={HomePage}
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="Passenger"
          component={PassengerMap}
        />

        <Stack.Screen
          name="Driver"
          component={DriverMap}
        />

      </Stack.Navigator>
    </NavigationContainer>
  );
}