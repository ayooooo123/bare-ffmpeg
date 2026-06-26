cmake_minimum_required(VERSION 3.25)

find_package(cmake-bare REQUIRED PATHS node_modules/cmake-bare)
find_package(cmake-harden REQUIRED PATHS node_modules/cmake-harden)
find_package(cmake-ports REQUIRED PATHS node_modules/cmake-ports)

project(bare_ffmpeg C CXX)

option(BARE_FFMPEG_ENABLE_GPL "Enable GPL-licensed features (e.g., x264)" OFF)

fetch_package("github:holepunchto/libjstl#ca590d6")

# PearTube is the universal transcoder: it must DECODE a broad set of input
# codecs (to re-encode for cast targets), but only ever ENCODES H.264 + AAC.
# So we keep dav1d (the only AV1 decoder; native AV1 decode is too slow to
# transcode) but drop the libvpx and libopus *external* libraries: FFmpeg's
# native vp8/vp9/opus decoders (enabled in cmake/ports/ffmpeg/port.cmake) cover
# the same inputs, and libvpx/libopus only add value for ENCODING, which we
# never do. Net effect: identical decode coverage, ~1.5-2.5 MB/ABI smaller.
set(ffmpeg_features dav1d)

if(BARE_FFMPEG_ENABLE_GPL)
  list(APPEND ffmpeg_features gpl x264)
endif()

find_port(ffmpeg FEATURES ${ffmpeg_features})

set(install_targets)

if(LINUX)
  list(APPEND install_targets TARGET va TARGET va-drm)
endif()

add_bare_module(bare_ffmpeg INSTALL ${install_targets})

harden(${bare_ffmpeg})

target_sources(
  ${bare_ffmpeg}
  PRIVATE
    binding.cc
)

set(link_libraries
  avcodec
  avdevice
  avformat
  avutil
  swresample
  swscale
  jstl
)

if(LINUX)
  list(APPEND link_libraries va va-drm)
endif()

target_link_libraries(
  ${bare_ffmpeg}
  PRIVATE
    ${link_libraries}
)
