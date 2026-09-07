using UnityEditor;

namespace SniperRidge.EditorTools
{
    /// <summary>*_normal 텍스처는 노멀맵으로, 지형/식생 텍스처는 반복 타일링으로 임포트한다.</summary>
    public class SniperRidgeAssetPostprocessor : AssetPostprocessor
    {
        // 값을 올리면 관련 텍스처가 자동으로 다시 임포트된다.
        public override uint GetVersion() => 1;

        void OnPreprocessTexture()
        {
            string path = assetPath.Replace('\\', '/');
            bool ours = path.StartsWith("Assets/Resources/Terrain/") || path.StartsWith("Assets/Resources/Nature/") ||
                        path.StartsWith("Assets/EnemyModel/") || path.StartsWith("Assets/Resources/Sky/");
            if (!ours) return;
            var importer = (TextureImporter)assetImporter;
            string name = System.IO.Path.GetFileNameWithoutExtension(path).ToLowerInvariant();
            if (name.EndsWith("_normal"))
            {
                importer.textureType = TextureImporterType.NormalMap;
            }
            if (path.StartsWith("Assets/Resources/Terrain/") || path.StartsWith("Assets/Resources/Nature/"))
            {
                importer.wrapMode = UnityEngine.TextureWrapMode.Repeat;
                importer.maxTextureSize = 1024;
            }
            if (path.StartsWith("Assets/Resources/Sky/"))
            {
                importer.maxTextureSize = 2048;
                importer.mipmapEnabled = false;
            }
        }
    }
}
