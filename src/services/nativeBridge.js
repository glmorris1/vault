import { Browser } from "@capacitor/browser";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";

export function isNativeApp() {
  return Boolean(Capacitor?.isNativePlatform?.());
}

export function getNativePlatform() {
  return Capacitor?.getPlatform?.() || "web";
}

export function isAndroidApp() {
  return getNativePlatform() === "android";
}

export function isIosApp() {
  return getNativePlatform() === "ios";
}

async function getNativePhoto(source) {
  if (!isNativeApp()) return "";

  const photo = await Camera.getPhoto({
    quality: 85,
    resultType: CameraResultType.DataUrl,
    source,
    allowEditing: false,
    correctOrientation: true,
    promptLabelHeader: "Add photo",
    promptLabelPhoto: "Take photo",
    promptLabelPicture: "Choose from photos",
  });

  return photo?.dataUrl || "";
}

export async function promptForNativePhoto(options = {}) {
  const source = options.source || (isAndroidApp() ? CameraSource.Camera : CameraSource.Prompt);
  return getNativePhoto(source);
}

export async function takeNativePhoto() {
  return getNativePhoto(CameraSource.Camera);
}

export async function chooseNativePhoto() {
  return getNativePhoto(CameraSource.Photos);
}

export async function shareNative({ title, text, url }) {
  if (!isNativeApp()) return false;
  const shareText = url && text && !text.includes(url) ? `${text}\n${url}` : text;

  await Share.share({
    title,
    text: shareText,
    url,
    dialogTitle: "Share Vault locations",
  });
  return true;
}

export async function openNativeBrowser(url) {
  if (!isNativeApp()) {
    window.location.href = url;
    return false;
  }

  await Browser.open({ url });
  return true;
}
