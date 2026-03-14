cmake_minimum_required(VERSION 3.20)
project(AthenaServer CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Force x64 (Arma 3 x64 only)
if(NOT CMAKE_SIZEOF_VOID_P EQUAL 8)
    message(FATAL_ERROR "This project must be built for x64.")
endif()

add_library(AthenaServer_x64 SHARED
    dllmain.cpp
)

target_include_directories(AthenaServer_x64 PRIVATE .)
target_link_libraries(AthenaServer_x64 PRIVATE winhttp kernel32)

# Output name without the 'lib' prefix (MSVC default)
set_target_properties(AthenaServer_x64 PROPERTIES
    OUTPUT_NAME  "AthenaServer_x64"
    PREFIX       ""
    SUFFIX       ".dll"
)

# MSVC-specific: static runtime /MT so the DLL has zero external CRT dependencies
if(MSVC)
    # Statically link the CRT — no MSVCP140.dll / VCRUNTIME140.dll needed at load time
    set_property(TARGET AthenaServer_x64 PROPERTY MSVC_RUNTIME_LIBRARY "MultiThreaded")
    target_compile_options(AthenaServer_x64 PRIVATE /W3 /O2)
endif()
