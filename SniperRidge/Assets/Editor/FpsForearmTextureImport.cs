using UnityEditor;

namespace SniperRidge.EditorTools
{
    public sealed class FpsForearmTextureImport : AssetPostprocessor
    {
        void OnPreprocessTexture()
        {
            if (!assetPath.Contains("Hands/forearm_skin_")) return;
            var texture = (TextureImporter)assetImporter;
            texture.mipmapEnabled = true;
            texture.anisoLevel = 8;
            texture.maxTextureSize = 2048;
            texture.wrapModeU = UnityEngine.TextureWrapMode.Repeat;
            texture.wrapModeV = UnityEngine.TextureWrapMode.Clamp;
            texture.textureCompression = TextureImporterCompression.CompressedHQ;
            if (assetPath.EndsWith("_normal.png"))
            {
                texture.textureType = TextureImporterType.NormalMap;
                texture.convertToNormalmap = false;
            }
            else if (!assetPath.Contains("albedo")) texture.sRGBTexture = false;
        }
    }
}
