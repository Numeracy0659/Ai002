cmake_minimum_required(VERSION 3.22.1)
project(codeforge_pty)

add_library(codeforge_pty SHARED pty_bridge.cpp)

target_compile_features(codeforge_pty PRIVATE cxx_std_17)
target_compile_options(codeforge_pty PRIVATE -Wall -Wextra -Werror=return-type)
target_link_libraries(codeforge_pty log)
