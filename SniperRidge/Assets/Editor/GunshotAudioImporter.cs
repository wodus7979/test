using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    /// <summary>Keep gunshot transients in PCM instead of lossy compression.</summary>
    public class GunshotAudioImporter : AssetPostprocessor
    {
        public override uint GetVersion() => 5;

        static bool IsWeaponAudio(string path) => path.StartsWith("Assets/Resources/Audio/shot_") || path.StartsWith("Assets/Resources/Audio/rocket_");

        void OnPreprocessAudio()
        {
            if (!IsWeaponAudio(assetPath)) return;
            var importer = (AudioImporter)assetImporter;
            importer.forceToMono = false;
            importer.loadInBackground = false;
            var settings = importer.defaultSampleSettings;
            settings.preloadAudioData = true;
            settings.compressionFormat = AudioCompressionFormat.PCM;
            settings.loadType = AudioClipLoadType.DecompressOnLoad;
            settings.sampleRateSetting = AudioSampleRateSetting.PreserveSampleRate;
            importer.defaultSampleSettings = settings;
            // Existing platform overrides must not silently restore lossy desktop compression.
            importer.SetOverrideSampleSettings("Standalone", settings);
        }

        [MenuItem("Sniper Ridge/총성 오디오 다시 가져오기")]
        public static void Reimport()
        {
            foreach (var guid in AssetDatabase.FindAssets("t:AudioClip", new[] { "Assets/Resources/Audio" }))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                if (IsWeaponAudio(path))
                    AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate);
            }
            Debug.Log("[Sniper Ridge] 총성 PCM 오디오 가져오기 완료.");
        }
    }
}
