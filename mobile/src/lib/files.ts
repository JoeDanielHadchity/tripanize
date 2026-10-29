import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { apiResponse } from "./auth";
import type { MobileCommandResult, MobileValues } from "./workspace";
export type PickedFile = { uri: string; name: string; type: string; size: number; file?: File };
export async function pickFiles(source: "camera" | "photos" | "files"): Promise<PickedFile[]> {
  if (source === "files") {
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/jpeg", "image/png", "image/webp"], multiple: true, copyToCacheDirectory: true });
    return result.canceled ? [] : result.assets.map(a => ({ uri: a.uri, name: a.name, type: a.mimeType ?? "application/octet-stream", size: a.size ?? 0, file: a.file }));
  }
  if (source === "camera" && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error("Allow camera access to photograph a receipt.");
  const result = source === "camera" ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9, exif: false }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 5, quality: 0.9, exif: false, preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible });
  return result.canceled ? [] : result.assets.map(a => ({ uri: a.uri, name: a.fileName ?? "receipt.jpg", type: a.mimeType ?? "image/jpeg", size: a.fileSize ?? 0, file: a.file }));
}
export async function uploadFiles(tripId: string, op: "expense" | "booking" | "scan", values: MobileValues, files: PickedFile[]): Promise<MobileCommandResult & { scan?: { merchant: string | null; amount: string | null; currency: string | null; date: string | null; category: string; warnings: string[] } }> {
  if (files.length > 5 || files.reduce((sum, f) => sum + f.size, 0) > 10 * 1024 * 1024) throw new Error("Attach up to five files, totaling 10 MB.");
  const body = new FormData(); body.append("op", op); body.append("values", JSON.stringify(values));
  for (const file of files) {
    if (Platform.OS === "web") body.append("files", file.file ?? await (await fetch(file.uri)).blob(), file.name);
    else body.append("files", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  }
  const response = await apiResponse(`/api/mobile/files?tripId=${encodeURIComponent(tripId)}`, { method: "POST", body });
  return response.json();
}
export async function shareDownload(path: string, name: string) {
  if (!path.startsWith("/api/mobile/files?")) throw new Error("Invalid download.");
  const response = await apiResponse(path);
  if (!(response.headers.get("Content-Type") ?? "").match(/^(application\/(pdf|json)|image\/(jpeg|png|webp))/)) throw new Error("This document is unavailable.");
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 15000); return;
  }
  const { File, Paths, Directory } = await import("expo-file-system");
  const Sharing = await import("expo-sharing");
  if (!await Sharing.isAvailableAsync()) throw new Error("Sharing is unavailable on this device.");
  const folder = new Directory(Paths.cache, "tripanize-downloads"); folder.create({ intermediates: true, idempotent: true });
  const file = new File(folder, `${Date.now()}-${name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`);
  file.write(new Uint8Array(await response.arrayBuffer()));
  try { await Sharing.shareAsync(file.uri, { dialogTitle: "Save or share your Tripanize document" }); }
  finally { if (file.exists) file.delete(); }
}
