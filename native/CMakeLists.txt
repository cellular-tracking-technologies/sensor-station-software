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
  cmake_parse_arguments(T "" "" "SOURCES;LINK" ${ARGN})
  file(STRINGS "${CMAKE_CURRENT_SOURCE_DIR}/src/${name}/VERSION" _ver)
  add_executable(${name} ${T_SOURCES})
  target_include_directories(${name} PRIVATE src/${name})
  target_compile_definitions(${name} PRIVATE CTT_VERSION="${_ver}")
  if(T_LINK)
    target_link_libraries(${name} PRIVATE ${T_LINK})
  endif()
  install(TARGETS ${name} RUNTIME DESTINATION bin)
endfunction()

# ctthw — shared native hardware library: the I2C bus resource, one driver class
# per chip, and the board-identity composition. Tools link it instead of
# re-implementing hardware access; new tools (sensor readers, etc.) reuse it.
add_library(ctthw STATIC
  lib/ctthw/i2c/i2c_bus.cpp
  lib/ctthw/chips/sx1509b.cpp
  lib/ctthw/chips/at24mac602.cpp
  lib/ctthw/chips/mcp79412.cpp
  lib/ctthw/chips/atsha204a.cpp
  lib/ctthw/chips/max11645.cpp
  lib/ctthw/chips/tmp411.cpp
  lib/ctthw/board/board_id.cpp
  lib/ctthw/board/sensors.cpp)
target_include_directories(ctthw PUBLIC lib/ctthw)

# ctt-radio-driver — bridges a radio serial port to an AF_UNIX socket. Needs nlohmann/json.
ctt_tool(ctt-radio-driver
  SOURCES src/ctt-radio-driver/driver.cpp src/ctt-radio-driver/serial_port.cpp)
if(nlohmann_json_FOUND)
  target_link_libraries(ctt-radio-driver PRIVATE nlohmann_json::nlohmann_json)
else()
  message(STATUS "nlohmann_json not found; expecting native/third_party/nlohmann/json.hpp")
  target_include_directories(ctt-radio-driver PRIVATE third_party)
endif()

# ctt-board-detect — boot-time board detection + hardware identity; thin shell
# over ctthw (board_id composition + I2C chip drivers).
ctt_tool(ctt-board-detect SOURCES src/ctt-board-detect/main.cpp LINK ctthw)

# ctt-sensors — daemon: poll I2C ADC + temp via ctthw, publish /run/ctt/sensors.json.
ctt_tool(ctt-sensors SOURCES src/ctt-sensors/main.cpp LINK ctthw)
