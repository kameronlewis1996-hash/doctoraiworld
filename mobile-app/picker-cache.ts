// These folders are created by the installed Expo picker implementations.
// Never delete the source document or a URI outside this app's cache.
export function createPickerCache(cacheRoot: string, remove: (uri: string) => Promise<void>) {
  const folders = ["ImagePicker/", "DocumentPicker/"].map(name => `${cacheRoot}${name}`);
  function owns(uri: string) {
    return folders.some(folder => uri.startsWith(folder)) && !/%2e|%2f|%5c|\\/i.test(uri) && !uri.split("/").includes("..");
  }
  return {
    removeCopy: async (uri?: string) => { if (uri && owns(uri)) await remove(uri); },
    clear: async () => { await Promise.all(folders.map(remove)); },
  };
}
