using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    [InitializeOnLoad] public static class FpsSkinValidation
    {
        const string Key="FpsSkin.Validation";
        static int stage,last=-1,ammo;
        static float at;
        static FpsSkinValidation(){EditorApplication.update+=Poll;}
        static void Check(bool ok,string reason){if(!ok)throw new Exception("FPS skin: "+reason);}
        public static void Run()
        {
            var shader=Shader.Find("SniperRidge/FPS Skin");Check(shader&&shader.isSupported&&!ShaderUtil.ShaderHasError(shader),"skin shader compilation failed");
            foreach(var name in new[]{"albedo","normal","metallicSmoothness"})
            {var t=Resources.Load<Texture2D>("Hands/forearm_skin_"+name);Check(t&&t.width==2048&&t.mipmapCount>1,"missing 2K mipmapped "+name);}
            var normal=(TextureImporter)AssetImporter.GetAtPath("Assets/Resources/Hands/forearm_skin_normal.png");
            Check(normal.textureType==TextureImporterType.NormalMap&&!normal.sRGBTexture,"normal map imported as color");
            FpsArmValidation.Validate();FPSWeaponsV2Validation.Validate();Preview();
            EditorSceneManager.OpenScene("Assets/Scenes/SniperRidge.unity");Directory.CreateDirectory("Logs");File.Delete("Logs/autoplay_result.txt");
            File.WriteAllText("Logs/autoplay.txt","mode=9\nwait=20\ntag=fps_skin\nquit=1\n");
            SessionState.SetBool(Key,true);SessionState.SetFloat(Key+"start",(float)EditorApplication.timeSinceStartup);
        }
        static void Capture(Camera camera,string label)
        {
            Directory.CreateDirectory("Screenshots/fps-skin");var rt=new RenderTexture(1600,1000,24);var tex=new Texture2D(1600,1000,TextureFormat.RGB24,false);
            var previous=camera.targetTexture;var active=RenderTexture.active;
            try{camera.targetTexture=rt;camera.Render();RenderTexture.active=rt;tex.ReadPixels(new Rect(0,0,1600,1000),0,0);tex.Apply();File.WriteAllBytes("Screenshots/fps-skin/"+label+".png",tex.EncodeToPNG());}
            finally{camera.targetTexture=previous;RenderTexture.active=active;UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(tex);}
        }
        static void Preview()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            RenderSettings.ambientMode=UnityEngine.Rendering.AmbientMode.Flat;RenderSettings.ambientLight=new Color(.24f,.26f,.29f);
            var light=new GameObject("Skin studio key").AddComponent<Light>();light.type=LightType.Directional;light.intensity=1.3f;light.color=new Color(1,.95f,.9f);light.transform.rotation=Quaternion.Euler(25,-35,0);
            var c=new GameObject("Skin studio camera").AddComponent<Camera>();c.fieldOfView=60;c.nearClipPlane=.01f;c.clearFlags=CameraClearFlags.SolidColor;c.backgroundColor=new Color(.13f,.16f,.18f);
            var definition=WeaponDefinition.All.First(d=>d.ModelName=="03_assault_rifle");
            var model=WeaponModels.Build(c.transform,definition);var hands=FpsWeaponHands.Attach(model.transform,definition);
            foreach(bool ads in new[]{false,true})
            {model.transform.localPosition=FpsWeaponView.Offset(definition,ads,model.transform);model.transform.localRotation=FpsWeaponView.Rotation(ads,0);hands.SetAiming(ads);hands.Pose(-1,-1);Capture(c,ads?"studio_ads":"studio_hip");}
            model.transform.localPosition=FpsWeaponView.Offset(definition,false,model.transform);model.transform.localRotation=FpsWeaponView.Rotation(false,0);hands.SetAiming(false);hands.Pose(.36f,-1);Capture(c,"studio_reload");
            // Inspect an actual posed arm close-up, with the weapon hidden only for this preview.
            hands.Pose(-1,-1);var arms=model.GetComponentInChildren<FpsForearms>();
            foreach(var r in model.GetComponentsInChildren<Renderer>())if(r!=arms.GetComponent<Renderer>())r.enabled=false;
            var mesh=arms.GetComponent<MeshFilter>().sharedMesh;var vertices=mesh.vertices;
            var centre=arms.transform.TransformPoint((vertices[24*25]+vertices[24*25+12])*.5f);
            model.transform.SetParent(null,true);c.transform.position=centre+new Vector3(.32f,.18f,-.28f);c.transform.LookAt(centre);c.fieldOfView=43;
            Capture(c,"skin_closeup");var material=arms.GetComponent<Renderer>().sharedMaterials[0];
            material.SetFloat("_BumpScale",0);Capture(c,"skin_no_normal");material.SetFloat("_BumpScale",.85f);
            light.transform.rotation=Quaternion.LookRotation((c.transform.position-centre).normalized);Capture(c,"skin_backlight");
            material.SetFloat("_ScatterStrength",0);Capture(c,"skin_no_scatter");
            Check(!ShaderUtil.ShaderHasError(material.shader),"skin shader failed during rendering");
        }
        static void Next(){stage++;at=Time.time;}
        static void Poll()
        {
            if(!SessionState.GetBool(Key,false))return;
            try
            {
                Check(EditorApplication.timeSinceStartup-SessionState.GetFloat(Key+"start",0)<180,"Play timeout");var gm=GameManager.Instance;
                if(EditorApplication.isPlaying&&gm&&gm.IsPlaying&&gm.Assault&&last!=Time.frameCount)
                {
                    last=Time.frameCount;var p=gm.Player;float age=Time.time-at;var camera=p.Eye.GetComponent<Camera>();
                    if(stage==0&&p.State==SniperController.WeaponState.Ready)
                    {
                        gm.Assault.StopAllCoroutines();gm.Assault.enabled=false;
                        foreach(var e in gm.Assault.Soldiers){e.enabled=false;if(e.Combat)e.Combat.enabled=false;var nav=e.GetComponent<AssaultNavigation>();if(nav)nav.Move(Vector3.zero,0,0);var g=e.GetComponent<EnemyGrenadier>();if(g)g.enabled=false;}
                        Next();
                    }
                    else if(stage==1&&age>.5f){Capture(camera,"city_hip");ammo=p.AmmoInMag;p.PressFire();Next();}
                    else if(stage==2&&age>.3f){Check(p.AmmoInMag==ammo-1,"hip fire failed");p.ToggleScope();Next();}
                    else if(stage==3&&age>.5f){Check(p.IsScoped&&p.AimWeight>.95f,"ADS failed");Capture(camera,"city_ads");p.PressFire();Next();}
                    else if(stage==4&&age>.3f){Check(p.AmmoInMag==ammo-2,"ADS fire failed");p.PressReload();Next();}
                    else if(stage==5&&age>.8f){Check(p.State==SniperController.WeaponState.Reloading,"reload missing");Capture(camera,"city_reload");Next();}
                    else if(stage==6&&p.State==SniperController.WeaponState.Ready)
                    {Check(p.AmmoInMag==ammo,"reload failed to restore ammo");Capture(camera,"city_restored");Check(!ShaderUtil.ShaderHasError(Shader.Find("SniperRidge/FPS Skin")),"Metal shader error");Debug.Log("[FPS skin] PASS: 2K PBR/normal imports, all weapon grip/reload/ADS deformation and sight lines; city hip/ADS fire, reload and restore; skin shader renders on Metal.");stage=99;}
                }
                if(!EditorApplication.isPlaying&&File.Exists("Logs/autoplay_result.txt"))
                {Check(stage==99&&File.ReadAllText("Logs/autoplay_result.txt").Contains("errors=0"),"Play incomplete/errors");SessionState.SetBool(Key,false);EditorApplication.Exit(0);}
            }
            catch(Exception ex){Debug.LogException(ex);SessionState.SetBool(Key,false);EditorApplication.Exit(1);}
        }
    }
}
