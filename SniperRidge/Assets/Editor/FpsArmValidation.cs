using System;
using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    public static class FpsArmValidation
    {
        [MenuItem("Sniper Ridge/손·팔 재질과 변형 검사")]
        public static void Validate()
        {
            if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop Play before validation.");
            foreach(string path in new[]{"Hands/sleeve_ripstop_albedo","Hands/glove_suede_albedo"})
            {
                var texture=Resources.Load<Texture2D>(path);
                Check(texture!=null&&texture.mipmapCount>1&&texture.width>=1024,"Missing mipmapped fabric: "+path);
            }
            var camera=new GameObject("Arm validation camera").AddComponent<Camera>();
            GameObject model=null;
            try
            {
                foreach(var definition in WeaponDefinition.All)
                {
                    if(definition.IsMounted||definition.IsTank)continue;
                    model=UnityEngine.Object.Instantiate(WeaponModels.LoadPrefab(definition.ModelName),camera.transform);
                    var hands=FpsWeaponHands.Attach(model.transform,definition);
                    foreach(bool aim in new[]{false,true})
                    {
                        model.transform.localPosition=FpsWeaponView.Offset(definition,aim,model.transform);
                        model.transform.localRotation=FpsWeaponView.Rotation(aim,0);
                        hands.SetAiming(aim);
                        for(int frame=0;frame<=20;frame++)
                        {
                            hands.Pose(frame==0?-1:(frame-1)/19f,-1);
                            var sleeve=model.GetComponentInChildren<FpsForearms>().GetComponent<MeshFilter>().sharedMesh;
                            Check(sleeve.vertexCount>2000&&sleeve.tangents.Length==sleeve.vertexCount,"Missing sleeve detail/tangents");
                            foreach(var v in sleeve.vertices)Check(Finite(v)&&v.sqrMagnitude<9,"Unstable sleeve deformation: "+definition.Id);
                            foreach(var glove in model.GetComponentsInChildren<SkinnedMeshRenderer>())
                            {
                                var baked=new Mesh();
                                try
                                {
                                    glove.BakeMesh(baked);
                                    Check(baked.subMeshCount==3&&baked.tangents.Length==baked.vertexCount,"Missing glove surface groups/tangents");
                                    foreach(var v in baked.vertices)Check(Finite(v)&&v.sqrMagnitude<.25f,"Unstable finger skinning");
                                }
                                finally{UnityEngine.Object.DestroyImmediate(baked);}
                            }
                        }
                    }
                    UnityEngine.Object.DestroyImmediate(model);model=null;
                }
                Debug.Log("[FPS arm validation] PASS: fabric imports, glove skinning, sleeve deformation, hip/ADS/reload poses for all handheld weapons.");
            }
            finally{if(model!=null)UnityEngine.Object.DestroyImmediate(model);UnityEngine.Object.DestroyImmediate(camera.gameObject);}
        }
        static bool Finite(Vector3 v)=>!float.IsNaN(v.x)&&!float.IsNaN(v.y)&&!float.IsNaN(v.z)&&!float.IsInfinity(v.x)&&!float.IsInfinity(v.y)&&!float.IsInfinity(v.z);
        static void Check(bool ok,string message){if(!ok)throw new InvalidOperationException(message);}
    }
}
