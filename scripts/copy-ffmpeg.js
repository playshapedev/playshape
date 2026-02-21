/**
 * Electron-builder afterPack hook to bundle ffmpeg binary.
 * 
 * Copies the ffmpeg binary from ffmpeg-static to the app's resources directory.
 * This runs after the app is packaged but before it's signed/notarized.
 */
const fs = require('fs')
const path = require('path')

exports.default = async function (context) {
  const { electronPlatformName, appOutDir } = context

  // Determine the resources directory based on platform
  let resourcesDir
  if (electronPlatformName === 'darwin') {
    // macOS: app bundle structure
    const appName = context.packager.appInfo.productFilename
    resourcesDir = path.join(appOutDir, `${appName}.app`, 'Contents', 'Resources')
  }
  else {
    // Windows/Linux: flat structure
    resourcesDir = path.join(appOutDir, 'resources')
  }

  // Get the ffmpeg binary from ffmpeg-static
  let ffmpegStatic
  try {
    ffmpegStatic = require('ffmpeg-static')
  }
  catch (err) {
    console.warn('[afterPack] ffmpeg-static not found, skipping ffmpeg bundling')
    return
  }

  if (!ffmpegStatic || !fs.existsSync(ffmpegStatic)) {
    console.warn('[afterPack] ffmpeg-static binary not found, skipping')
    return
  }

  // Determine binary name based on platform
  const binaryName = electronPlatformName === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const destPath = path.join(resourcesDir, binaryName)

  // Copy the binary
  fs.copyFileSync(ffmpegStatic, destPath)

  // Ensure executable permission on Unix
  if (electronPlatformName !== 'win32') {
    fs.chmodSync(destPath, 0o755)
  }

  console.log(`[afterPack] Copied ffmpeg to ${destPath}`)

  // Also try to copy ffprobe if available (for metadata extraction)
  // ffmpeg-static doesn't include ffprobe, but check anyway
  const ffprobeSource = ffmpegStatic.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1')
  if (fs.existsSync(ffprobeSource)) {
    const ffprobeName = electronPlatformName === 'win32' ? 'ffprobe.exe' : 'ffprobe'
    const ffprobeDest = path.join(resourcesDir, ffprobeName)
    fs.copyFileSync(ffprobeSource, ffprobeDest)
    if (electronPlatformName !== 'win32') {
      fs.chmodSync(ffprobeDest, 0o755)
    }
    console.log(`[afterPack] Copied ffprobe to ${ffprobeDest}`)
  }
}
