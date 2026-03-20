/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-native/no-inline-styles */

import React, { useEffect, useState, useRef } from 'react';
import Toast from 'react-native-toast-message';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  View,
  Text,
  Button,
  PermissionsAndroid,
  Platform,
  Linking,
  Image,
  TouchableOpacity,
  Modal,
} from 'react-native';

import MapView, { Marker, AnimatedRegion } from 'react-native-maps';
import Geolocation from 'react-native-geolocation-service';
import MapViewDirections from 'react-native-maps-directions';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import io from 'socket.io-client';

const GOOGLE_KEY = 'AIzaSyBQs0fTyyb9p_E8pAMZeVFt1h43kOqms2A';
const SOCKET = 'https://socket-server-3kjo.onrender.com';

const showToast = (message, type) => {
  Toast.show({
    type: type,
    text1: message,
    position: 'top',
  });
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

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};
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
  const [showDriversModal, setShowDriversModal] = useState(false);
  const [activeRide, setActiveRide] = useState(null);
  const [pickupText, setPickupText] = useState('');
  const [dropText, setDropText] = useState('');
  const [isSelectingPlace, setIsSelectingPlace] = useState(false);
  const [activeInput, setActiveInput] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [declinedDrivers, setDeclinedDrivers] = useState([]);
  // 🔥 MULTI DRIVER MARKERS
  const driverMarkers = useRef({});
  const pickupRef = useRef();
  const dropRef = useRef();

  const getAddressFromCoords = async (lat, lng, setText) => {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_KEY}`,
      );

      const data = await res.json();

      if (data.results && data.results.length > 0) {
        const address = data.results[0].formatted_address;
        setText(address); // 🔥 update input field
      }
    } catch (err) {
      console.log('Geocode error:', err);
    }
  };

  // 🚕 REQUEST RIDE
  const requestRide = driverId => {
    setDeclinedDrivers([]);
    if (!passengerLocation) {
      showToast('Pickup location not detected 📍', 'error');
      return;
    }

    if (!dropLocation) {
      showToast('Please select drop location 📍', 'error');
      return;
    }

    if (!driverId) {
      showToast('Invalid driver', 'error');
      return;
    }

    socketRef.current.emit('request-ride', {
      passengerSocketId: socketRef.current.id,
      pickup: {
        latitude: passengerLocation.latitude,
        longitude: passengerLocation.longitude,
        address: pickupText,
      },
      drop: {
        latitude: dropLocation.latitude,
        longitude: dropLocation.longitude,
        address: dropText,
      },
      driverId,
      fare: fare,
    });

    showToast('Request sent... waiting for driver ⏳', 'info');
  };
  // 🚕 CANCEL RIDE
  const cancelRide = () => {
    if (!activeRide) return;

    socketRef.current.emit('cancel-ride', {
      passengerSocketId: socketRef.current.id,
      driverId: activeRide.driverId,
    });

    showToast('Ride Cancelled ❌', 'error');

    setActiveRide(null);
    setDriverPhone(null);
  };

  useEffect(() => {
    console.log('ACTIVE RIDE:', activeRide);
    if (activeRide?.status === 'trip_completed') {
      showToast('Ride Completed 🎉', 'success');
      setTimeout(() => {
        setActiveRide(null);
        setDriverPhone(null);
      }, 3000);
    }
  }, [activeRide]);

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

          // 🔥 GET ADDRESS NAME
          getAddressFromCoords(
            location.latitude,
            location.longitude,
            address => {
              setPickupText(address);
              pickupRef.current?.setAddressText(address);
            },
          );

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
        console.log(list, '<<< driver listtt');
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
            driverMarkers.current[id]
              .timing({
                latitude,
                longitude,
                duration: 700,
                useNativeDriver: false,
              })
              .start();
          }
        });
      });

      // 📞 RIDE ACCEPTED

      socketRef.current.on('ride-accepted', data => {
        console.log(data, '<< ride-accepted data');
        setDriverPhone(data.phone);

        setActiveRide({
          driverId: data.driverId,
          status: data.status, // ✅ FIX
          driverLocation: data.driverLocation,
          otp: data.otp,
        });

        // ✅ CLOSE MODAL HERE
        setShowDriversModal(false);
        setSelectedDriver(null);

        showToast('Driver accepted', 'success');
      });

      socketRef.current.on('driver-location', data => {
        setActiveRide(prev => {
          if (!prev || data.driverId !== prev.driverId) return prev;

          return {
            ...prev,
            driverLocation: {
              latitude: data.latitude,
              longitude: data.longitude,
            },
          };
        });
      });
      socketRef.current.on('ride-cancelled', () => {
        setActiveRide(null);
        setDriverPhone(null);
      });
      socketRef.current.on('ride-cancelled-success', () => {
        showToast('Ride cancelled successfully ✅', 'success');
      });
      socketRef.current.on('ride-declined', data => {
        showToast('Driver declined ❌ Try another driver', 'error');

        if (data?.driverId) {
          setDeclinedDrivers(prev => [...prev, data.driverId]);
        }
      });
      socketRef.current.on('trip_started', () => {
        setActiveRide(prev => ({
          ...prev,
          status: 'trip_started',
        }));

        showToast('Trip Started 🚀', 'success');
      });

      socketRef.current.on('trip-ended', () => {
        setActiveRide(prev => ({
          ...prev,
          status: 'trip_completed',
        }));

        showToast('Trip Completed 🎉', 'success');

        // reset after 3 sec
        setTimeout(() => {
          setActiveRide(null);
          setDriverPhone(null);
          setDropLocation(null);
        }, 3000);
      });

      socketRef.current.on('ride-status-update', data => {
        setActiveRide(prev => {
          if (!prev || prev.driverId !== data.driverId) return prev;

          return {
            ...prev,
            status: data.status,
          };
        });
      });
    };

    init();

    return () => {
      if (watchId.current) Geolocation.clearWatch(watchId.current);
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

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
    if (!socketRef.current || !passengerLocation) return;

    const timeout = setTimeout(() => {
      socketRef.current.emit('get-nearby-drivers', {
        latitude: passengerLocation.latitude,
        longitude: passengerLocation.longitude,
      });
    }, 2000);

    return () => clearTimeout(timeout);
  }, [passengerLocation]);

  const fare = distance ? 40 + distance * 12 : 0;

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          position: 'absolute',
          top: 20,
          width: '100%',
          alignItems: 'center',
          zIndex: 9999,
          elevation: 9999, // 🔥 ADD THIS
        }}
      >
        <View
          style={{
            width: '90%',
            backgroundColor: '#fff',
            borderRadius: 18,
            paddingVertical: 12,
            paddingHorizontal: 12,
            elevation: 10,
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 10,
          }}
        >
          {/* 🔵 PICKUP */}
          <View style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {/* ICON */}
              <Ionicons name="radio-button-on" size={18} color="#419952" />

              {/* INPUT */}
              <View style={{ flex: 1, marginLeft: 8, position: 'relative' }}>
                <GooglePlacesAutocomplete
                  ref={pickupRef}
                  placeholder="Pickup location"
                  fetchDetails
                  currentLocation={true} // 🔥 முக்கியம்
                  currentLocationLabel="Use Current Location 📍" // 🔥 label
                  nearbyPlacesAPI="GooglePlacesSearch" // 🔥 required
                  textInputProps={{
                    value: pickupText,
                    onChangeText: setPickupText,
                    placeholderTextColor: '#888',
                  }}
                  onPress={(data, details = null) => {
                    const location = {
                      latitude: details.geometry.location.lat,
                      longitude: details.geometry.location.lng,
                    };

                    setPassengerLocation(location);
                    setPickupText(data.description);

                    mapRef.current?.animateToRegion({
                      ...location,
                      latitudeDelta: 0.01,
                      longitudeDelta: 0.01,
                    });
                  }}
                  query={{
                    key: GOOGLE_KEY,
                    language: 'en',
                    components: 'country:in',
                  }}
                  styles={{
                    container: {
                      flex: 0,
                      zIndex: 1000,
                    },
                    textInput: {
                      height: 45,
                      backgroundColor: '#f2f2f2',
                      borderRadius: 10,
                      paddingLeft: 12,
                      paddingRight: 45,
                      fontSize: 14,
                    },
                    listView: {
                      position: 'absolute',
                      top: 50,
                      left: 0,
                      right: 0,
                      backgroundColor: '#fff',
                      borderRadius: 12,
                      elevation: 20, // 🔥 INCREASE
                      zIndex: 9999, // 🔥 MUST HIGH
                    },
                  }}
                  enablePoweredByContainer={false}
                  keyboardShouldPersistTaps="always"
                  // listViewDisplayed="auto"
                  minLength={2}
                  debounce={200}
                  onFocus={() => setActiveInput('pickup')}
                  listViewDisplayed={activeInput === 'pickup'}
                />
                {/* ❌ CLEAR BUTTON */}
                {pickupText !== '' && (
                  <TouchableOpacity
                    onPress={() => {
                      setPickupText('');
                      setPassengerLocation(null);
                      pickupRef.current?.setAddressText('');
                    }}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: 0,
                      height: 45,
                      width: 35,
                      justifyContent: 'center',
                      alignItems: 'center',
                      zIndex: 9999, // 🔥 MUST
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close-circle" size={18} color="#666" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* DIVIDER LINE */}
          <View
            style={{
              height: 1,
              backgroundColor: '#eee',
              marginVertical: 6,
            }}
          />

          {/* 🔴 DROP */}
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {/* ICON */}
              <Ionicons name="location" size={18} color="#e74c3c" />

              {/* INPUT */}
              <View style={{ flex: 1, marginLeft: 8, position: 'relative' }}>
                <GooglePlacesAutocomplete
                  ref={dropRef}
                  placeholder="Where to?"
                  fetchDetails
                  textInputProps={{
                    value: dropText,
                    onChangeText: setDropText,
                    onFocus: () => setIsSelectingPlace(true), // 🔥
                    onBlur: () => setIsSelectingPlace(false), // 🔥
                  }}
                  onPress={(data, details = null) => {
                    if (!details) return; // 🔥 MUST

                    setIsSelectingPlace(false); // 🔥

                    const location = {
                      latitude: details.geometry.location.lat,
                      longitude: details.geometry.location.lng,
                    };

                    setDropLocation(location);
                    setDropText(data.description);

                    mapRef.current?.animateToRegion({
                      ...location,
                      latitudeDelta: 0.01,
                      longitudeDelta: 0.01,
                    });
                  }}
                  query={{
                    key: GOOGLE_KEY,
                    language: 'en',
                    components: 'country:in',
                  }}
                  styles={{
                    container: {
                      flex: 0,
                      zIndex: 999,
                    },
                    textInput: {
                      height: 45,
                      backgroundColor: '#f2f2f2',
                      borderRadius: 10,
                      paddingLeft: 12,
                      paddingRight: 45,
                      fontSize: 14,
                    },
                    listView: {
                      position: 'absolute',
                      top: 50,
                      left: 0,
                      right: 0,
                      backgroundColor: '#fff',
                      borderRadius: 12,
                      elevation: 20, // 🔥 INCREASE
                      zIndex: 9999, // 🔥 MUST HIGH
                    },
                  }}
                  enablePoweredByContainer={false}
                  keyboardShouldPersistTaps="always"
                  // listViewDisplayed="auto"
                  onFocus={() => setActiveInput('drop')}
                  listViewDisplayed={activeInput === 'drop'}
                  minLength={2}
                  debounce={200}
                />

                {/* ❌ CLEAR BUTTON */}
                {dropText !== '' && (
                  <TouchableOpacity
                    onPress={() => {
                      setDropText('');
                      setDropLocation(null);
                      dropRef.current?.setAddressText('');
                    }}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: 0,
                      height: 45,
                      width: 35,
                      justifyContent: 'center',
                      alignItems: 'center',
                      zIndex: 9999, // 🔥 MUST
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close-circle" size={18} color="#666" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>
      </View>

      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        pointerEvents="auto"
        initialRegion={{
          latitude: 13.0827,
          longitude: 80.2707,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        onPress={(data, details = null) => {
          if (!details) return;

          setIsSelectingPlace(true); // block temporarily

          const location = {
            latitude: details.geometry.location.lat,
            longitude: details.geometry.location.lng,
          };

          setDropLocation(location);
          setDropText(data.description);

          setTimeout(() => setIsSelectingPlace(false), 500); // 🔥 unlock

          mapRef.current?.animateToRegion({
            ...location,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          });
        }}
      >
        {/* 🧍 PASSENGER */}
        {passengerLocation && (
          // <Marker coordinate={passengerLocation} pinColor="blue" />
          <Marker
            coordinate={passengerLocation}
            draggable
            onDragEnd={async e => {
              const coord = e.nativeEvent.coordinate;
              setPassengerLocation(coord);

              await getAddressFromCoords(
                coord.latitude,
                coord.longitude,
                address => {
                  setPickupText(address);
                  pickupRef.current?.setAddressText(address);
                },
              );
            }}
            pinColor="#419952"
          />
        )}

        {/* 📍 DROP */}
        {dropLocation && (
          //  <Marker coordinate={dropLocation} pinColor="red" />
          <Marker
            coordinate={dropLocation}
            draggable
            onDragEnd={async e => {
              const coord = e.nativeEvent.coordinate;
              setDropLocation(coord);

              await getAddressFromCoords(
                coord.latitude,
                coord.longitude,
                address => {
                  setDropText(address);
                  dropRef.current?.setAddressText(address);
                },
              );
            }}
            pinColor="#e74c3c"
          />
        )}

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

        {activeRide?.driverLocation && (
          <Marker coordinate={activeRide.driverLocation}>
            <Image
              source={require('../assets/images/autorickshaw.png')}
              style={{ width: 40, height: 40 }}
            />
          </Marker>
        )}

        {activeRide &&
        passengerLocation &&
        (activeRide.driverLocation || passengerLocation) &&
        dropLocation ? (
          <MapViewDirections
            origin={activeRide.driverLocation || passengerLocation}
            destination={
              activeRide.status === 'driver_on_the_way'
                ? passengerLocation
                : dropLocation
            }
            apikey={GOOGLE_KEY}
            strokeWidth={5}
            strokeColor="#2E86FF"
          />
        ) : (
          passengerLocation &&
          dropLocation && (
            <MapViewDirections
              origin={passengerLocation}
              destination={dropLocation}
              apikey={GOOGLE_KEY}
              strokeWidth={6}
              strokeColor="#2E86FF"
              onReady={result => {
                setDistance(result.distance);
                setDuration(result.duration);
              }}
            />
          )
        )}
      </MapView>

      <View
        style={{
          position: 'absolute',
          bottom: 40,
          alignSelf: 'center',
        }}
      >
        <TouchableOpacity
          style={{
            backgroundColor: activeRide ? '#e74c3c' : '#419952',
            padding: 12,
            borderRadius: 10,
          }}
          onPress={() => {
            if (activeRide) {
              cancelRide();
            } else {
              if (!passengerLocation || !dropLocation) {
                showToast('Select pickup & drop location 📍', 'error');
                return;
              }
              setShowDriversModal(true);
            }
          }}
        >
          <Text style={{ color: 'white' }}>
            {activeRide ? 'Cancel Ride ❌' : 'Request Ride'}
          </Text>
        </TouchableOpacity>
      </View>
      {activeRide && (
        <View
          style={{
            position: 'absolute',
            bottom: 200,
            alignSelf: 'center',
            backgroundColor: '#fff',
            paddingVertical: 12,
            paddingHorizontal: 20,
            borderRadius: 25,
            elevation: 6,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Text style={{ fontWeight: '600', fontSize: 14 }}>
            {activeRide.status === 'otp_waiting' &&
              '🔐 Waiting for OTP verification'}
            {activeRide.status === 'driver_on_the_way' &&
              ' Driver coming to pickup'}
            {activeRide.status === 'trip_started' && '🟢 Trip started'}
            {activeRide.status === 'trip_completed' && '✅ Trip completed'}
          </Text>
        </View>
      )}

      {/* 📊 TRIP INFO */}
      {distance && (
        <View
          style={{
            position: 'absolute',
            bottom: 90,
            alignSelf: 'center',
            backgroundColor: 'white',
            padding: 12,
            borderRadius: 10,
          }}
        >
          <Text>Distance: {distance.toFixed(2)} km</Text>
          <Text>ETA: {Math.ceil(duration)} mins</Text>
          <Text>Fare: ₹{fare.toFixed(0)}</Text>

          {driverPhone && (
            <Button
              title="Call Driver"
              onPress={() => Linking.openURL(`tel:${driverPhone}`)}
            />
          )}
        </View>
      )}

      <Modal
        visible={showDriversModal}
        transparent={true}
        animationType="slide"
      >
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
              padding: 15,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 2 }}>
              Available Drivers
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: '#d1d1d1',
                fontWeight: 'bold',
                marginBottom: 10,
              }}
            >
              select your driver
            </Text>

            {drivers.length === 0 ? (
              <Text>No drivers available</Text>
            ) : (
              drivers
                .filter(driver => !declinedDrivers.includes(driver.driverId))
                .map(driver => {
                  const driverDistance =
                    passengerLocation &&
                    getDistance(
                      passengerLocation.latitude,
                      passengerLocation.longitude,
                      Number(driver.latitude),
                      Number(driver.longitude),
                    );
                  // const driverFare = driverDistance ? (40 + driverDistance * 12).toFixed(0) : fare;

                  return (
                    <TouchableOpacity
                      key={driver.driverId}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: 12,
                        borderBottomWidth: 1,
                        borderColor: '#eee',
                        backgroundColor:
                          selectedDriver === driver.driverId
                            ? '#e6f7ff'
                            : 'white', // 🔥 highlight
                      }}
                      // onPress={() => {
                      //   requestRide(driver.driverId);
                      //   setShowDriversModal(false);
                      // }}
                      onPress={() => {
                        setSelectedDriver(driver.driverId);
                      }}
                    >
                      {/* 👤 DRIVER IMAGE */}
                      <Image
                        source={{
                          uri:
                            driver.photo ||
                            'https://cdn-icons-png.flaticon.com/512/149/149071.png',
                        }}
                        style={{
                          width: 50,
                          height: 50,
                          borderRadius: 25,
                          marginRight: 10,
                        }}
                      />

                      {/* 📄 DETAILS */}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: 'bold', fontSize: 16 }}>
                          {driver.name || driver.driverId}
                        </Text>

                        <Text style={{ color: '#666' }}>
                          {driver.vehicleNumber || 'TN XX XXXX'}
                        </Text>

                        {driverDistance && (
                          <Text style={{ fontSize: 12, color: '#999' }}>
                            📍 {driverDistance.toFixed(2)} km away
                          </Text>
                        )}
                      </View>

                      {/* 💰 FARE */}
                      <Text style={{ fontWeight: 'bold', fontSize: 16 }}>
                        ₹{fare.toFixed(0)} 
                      </Text>
                    </TouchableOpacity>
                  );
                })
            )}
            <View style={{ marginTop: 15 }}>
              {/* ✅ CONFIRM BUTTON */}
              <TouchableOpacity
                disabled={!selectedDriver}
                style={{
                  backgroundColor: selectedDriver ? '#419952' : '#ccc',
                  paddingVertical: 10,
                  borderRadius: 12,
                  alignItems: 'center',
                  marginBottom: 10,
                  // 🔥 Shadow (iOS)
                  shadowColor: '#419952',
                  shadowOpacity: 0.2,
                  shadowRadius: 5,
                  shadowOffset: { width: 0, height: 3 },

                  // 🔥 Elevation (Android)
                  elevation: 5,
                }}
                onPress={() => {
                  if (!selectedDriver) return;

                  requestRide(selectedDriver);
                }}
              >
                <Text
                  style={{
                    color: 'white',
                    fontWeight: '600',
                    fontSize: 16,
                    letterSpacing: 0.5,
                  }}
                >
                  Confirm Ride
                </Text>
              </TouchableOpacity>

              {/* ❌ CLOSE BUTTON */}
              <TouchableOpacity
                style={{
                  paddingVertical: 10,
                  borderRadius: 12,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#ddd',
                  backgroundColor: '#FECE26',
                }}
                onPress={() => {
                  setShowDriversModal(false);
                  setSelectedDriver(null);
                }}
              >
                <Text
                  style={{
                    color: '#333',
                    fontWeight: '500',
                    fontSize: 15,
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {activeRide?.status === 'driver_on_the_way' && (
        <View
          style={{
            position: 'absolute',
            bottom: 250,
            alignSelf: 'center',
            backgroundColor: '#fff',
            padding: 20,
            borderRadius: 12,
            elevation: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontWeight: 'bold', fontSize: 16 }}>
            🔐 Share this OTP with Driver
          </Text>

          <Text
            style={{
              fontSize: 32,
              fontWeight: 'bold',
              marginTop: 10,
              color: '#419952',
            }}
          >
            {activeRide?.otp}
          </Text>
        </View>
      )}
    </View>
  );
}
