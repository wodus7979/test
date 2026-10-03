using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;

namespace SniperRidge.EditorTools
{
    public static class OliveTitanIntegration
    {
        public static void Build()
        {
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            var legacy=AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Resources/Hero/HulkReference.prefab");
            var model=AssetDatabase.LoadAssetAtPath<GameObject>("Assets/OliveTitan/Prefabs/OliveTitan.prefab");
            if(!legacy||!model)throw new Exception("Missing motion rig or Olive Titan package.");
            var root=UnityEngine.Object.Instantiate(legacy);root.name="OliveTitanPlayer";
            try
            {
                root.transform.SetPositionAndRotation(Vector3.zero,Quaternion.identity);root.transform.localScale=Vector3.one;
                var skins=root.GetComponentsInChildren<SkinnedMeshRenderer>();var motionBones=skins[0].bones;
                foreach(var skin in skins)UnityEngine.Object.DestroyImmediate(skin);
                foreach(var lod in root.GetComponents<LODGroup>())UnityEngine.Object.DestroyImmediate(lod);
                var character=UnityEngine.Object.Instantiate(model,root.transform,false);character.name="Character";
                character.transform.localScale=Vector3.one/HulkVisual.ModelScale;
                var adapter=root.AddComponent<HulkModelRetargeter>();adapter.MotionBones=motionBones;
                adapter.Character=character.GetComponent<Animator>();adapter.VisibleRenderers=character.GetComponentsInChildren<SkinnedMeshRenderer>();
                adapter.Character.enabled=false;root.GetComponent<Animator>().enabled=false;
                foreach(var skin in adapter.VisibleRenderers)skin.updateWhenOffscreen=true;
                PrefabUtility.SaveAsPrefabAsset(root,"Assets/Resources/Hero/OliveTitanPlayer.prefab");AssetDatabase.SaveAssets();
                Debug.Log("[Olive Titan integration] Built gameplay prefab, "+adapter.VisibleRenderers.Length+" renderers.");
            }
            finally{UnityEngine.Object.DestroyImmediate(root);}
        }
        public static void BuildAndValidate(){Build();OliveTitanGameplayValidation.Run();}
        public static void ValidateAll(){OliveTitanGameplayValidation.Run();HulkGaitValidation.Run();HulkAppearanceValidation.Run();}
    }
}
