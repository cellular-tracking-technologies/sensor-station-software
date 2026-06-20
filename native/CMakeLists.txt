cmake_minimum_required(VERSION 3.16)
project(sensor_station_native CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

add_compile_options(-Wall -Wextra)

find_package(nlohmann_json 3 QUIET)

# Define one native tool: an executable whose src/<name>/VERSION is embedded as
# CTT_VERSION. Each tool versions and releases independently — bump a tool's
# VERSION when its source changes and CI publishes only that tool's release.
function(ctt_tool name)
  cmake_parse_arguments(T "" "" "SOURCES" ${ARGN})
  file(STRINGS "${CMAKE_CURRENT_SOURCE_DIR}/src/${name}/VERSION" _ver)
  add_executable(${name} ${T_SOURCES})
  target_include_directories(${name} PRIVATE src/${name})
  target_compile_definitions(${name} PRIVATE CTT_VERSION="${_ver}")
  install(TARGETS ${name} RUNTIME DESTINATION bin)
endfunction()

# ctt-radio-driver — bridges a radio serial port to an AF_UNIX socket. Needs nlohmann/json.
ctt_tool(ctt-radio-driver
  SOURCES src/ctt-radio-driver/driver.cpp src/ctt-radio-driver/serial_port.cpp)
if(nlohmann_json_FOUND)
  target_link_libraries(ctt-radio-driver PRIVATE nlohmann_json::nlohmann_json)
else()
  message(STATUS "nlohmann_json not found; expecting native/third_party/nlohmann/json.hpp")
  target_include_directories(ctt-radio-driver PRIVATE third_party)
endif()

# ctt-station-id — boot-time hardware identity over I2C (no external deps).
ctt_tool(ctt-station-id SOURCES src/ctt-station-id/main.cpp)
