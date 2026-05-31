import { Browser } from "@capacitor/browser";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";

export function isNativeApp() {
  return Boolean(Capacitor?.isNativePlatform?.());
}

export async function promptForNativePhoto() {
  if (!isNativeApp()) return "";

  const photo = await Camera.getPhoto({
    quality: 85,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Prompt,
    allowEditing: false,
    correctOrientation: true,
    promptLabelHeader: "Add photo",
    promptLabelPhoto: "Take photo",
    promptLabelPicture: "Choose from photos",
  });

  return photo?.dataUrl || "";
}

export async function shareNative({ title, text, url }) {
  if (!isNativeApp()) return false;
  await Share.share({
    title,
    text,
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
