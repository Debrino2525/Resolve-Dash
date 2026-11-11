import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking } from 'react-native';

export interface PickedPhoto {
  uri: string;
  name: string;
  type: 'image/jpeg';
}

/** Longest side after resizing: sharp enough to recognise a parcel, small on mobile data. */
const MAX_SIDE = 1280;

/**
 * Takes or chooses a photo, then shrinks it to at most 1280 px and re-encodes it as JPEG
 * (~150–300 KB). Re-encoding also strips camera metadata such as GPS location.
 * Returns null if the person cancels or refuses permission.
 */
export async function pickPhoto(source: 'camera' | 'library'): Promise<PickedPhoto | null> {
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      source === 'camera' ? 'Camera access needed' : 'Photo access needed',
      'Allow access in Settings to add a photo.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ],
    );
    return null;
  }

  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;

  const context = ImageManipulator.manipulate(asset.uri);
  const longest = Math.max(asset.width ?? 0, asset.height ?? 0);
  if (longest > MAX_SIDE) {
    if ((asset.width ?? 0) >= (asset.height ?? 0)) context.resize({ width: MAX_SIDE });
    else context.resize({ height: MAX_SIDE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  return { uri: saved.uri, name: `photo-${Date.now()}.jpg`, type: 'image/jpeg' };
}
