/** Whether this browser can open a camera at all (needs HTTPS or localhost). */
export const cameraSupported = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
