using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    public sealed class BattleMusicImporter:AssetPostprocessor
    {
        public override uint GetVersion()=>1;
        void OnPreprocessAudio()
        {
            if(!assetPath.StartsWith("Assets/Resources/Audio/bgm_"))return;
            var importer=(AudioImporter)assetImporter;
            importer.forceToMono=false;importer.loadInBackground=true;
            var settings=importer.defaultSampleSettings;
            settings.loadType=AudioClipLoadType.Streaming;settings.preloadAudioData=false;
            settings.compressionFormat=AudioCompressionFormat.Vorbis;settings.quality=.75f;
            settings.sampleRateSetting=AudioSampleRateSetting.PreserveSampleRate;
            importer.defaultSampleSettings=settings;importer.SetOverrideSampleSettings("Standalone",settings);
        }
    }
}
