using UnityEditor;
namespace SniperRidge.EditorTools
{
    public sealed class VehicleTextureImport:AssetPostprocessor
    {
        void OnPreprocessTexture()
        {
            if(!assetPath.StartsWith("Assets/Resources/Vehicles/"))return;
            var importer=(TextureImporter)assetImporter;importer.mipmapEnabled=true;importer.wrapMode=UnityEngine.TextureWrapMode.Repeat;importer.anisoLevel=4;
            if(assetPath.EndsWith("_normal.png")){importer.textureType=TextureImporterType.NormalMap;importer.convertToNormalmap=false;}
            else if(assetPath.EndsWith("_mra.png"))importer.sRGBTexture=false;
        }
    }
}
