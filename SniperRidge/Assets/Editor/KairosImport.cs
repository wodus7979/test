using System.IO;
using UnityEditor;
using UnityEngine;
namespace SniperRidge.EditorTools
{
    public sealed class KairosTextureImport:AssetPostprocessor
    {
        void OnPreprocessTexture()
        {
            if(!assetPath.StartsWith("Assets/Kairos/Textures/")&&!assetPath.Contains("Hands/forearm_skin_"))return;
            var t=(TextureImporter)assetImporter;t.mipmapEnabled=true;t.anisoLevel=8;t.maxTextureSize=2048;
            if(assetPath.ToLowerInvariant().EndsWith("_normal.png")){t.textureType=TextureImporterType.NormalMap;t.convertToNormalmap=false;}
            else if(!assetPath.Contains("BaseColor")&&!assetPath.Contains("albedo"))t.sRGBTexture=false;
        }
    }
    public static class KairosImport
    {
        public static void Run()
        {
            const string root="Assets/Kairos/";
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            var importer=(ModelImporter)AssetImporter.GetAtPath(root+"Models/Kairos.fbx");
            importer.animationType=ModelImporterAnimationType.Generic;importer.avatarSetup=ModelImporterAvatarSetup.NoAvatar;
            importer.importAnimation=false;importer.optimizeGameObjects=false;importer.isReadable=true;
            importer.importCameras=false;importer.importLights=false;importer.SaveAndReimport();
            var material=new Material(Shader.Find("Standard")){name="Kairos skin and tactical clothing",color=Color.white};
            Texture2D T(string suffix)=>AssetDatabase.LoadAssetAtPath<Texture2D>(root+"Textures/Kairos_"+suffix+".png");
            material.mainTexture=T("BaseColor");material.SetTexture("_BumpMap",T("Normal"));material.EnableKeyword("_NORMALMAP");material.SetFloat("_BumpScale",.4f);
            material.SetTexture("_MetallicGlossMap",T("MetallicSmoothness"));material.EnableKeyword("_METALLICGLOSSMAP");material.SetFloat("_GlossMapScale",.55f);
            material.SetTexture("_OcclusionMap",T("AO"));material.SetFloat("_OcclusionStrength",.65f);
            string matPath=root+"Kairos.mat";var existing=AssetDatabase.LoadAssetAtPath<Material>(matPath);
            if(existing){EditorUtility.CopySerialized(material,existing);Object.DestroyImmediate(material);material=existing;}else AssetDatabase.CreateAsset(material,matPath);
            var model=Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(root+"Models/Kairos.fbx"));
            try
            {
                model.name="Kairos";
                foreach(var a in model.GetComponentsInChildren<Animator>())Object.DestroyImmediate(a);
                foreach(var skin in model.GetComponentsInChildren<SkinnedMeshRenderer>()){skin.sharedMaterials=new[]{material};skin.updateWhenOffscreen=true;}
                var prefab=PrefabUtility.SaveAsPrefabAsset(model,root+"Kairos.prefab");
                var set=AssetDatabase.LoadAssetAtPath<NativeMutantSet>("Assets/Resources/Hero/NativeMutant.asset");set.Appearance=prefab;EditorUtility.SetDirty(set);AssetDatabase.SaveAssets();
                Debug.Log("[Kairos] Appearance assigned; original Mixamo motions preserved.");
            }
            finally{Object.DestroyImmediate(model);}
        }
    }
}
