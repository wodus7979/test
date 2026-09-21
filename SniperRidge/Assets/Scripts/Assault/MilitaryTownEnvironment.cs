using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
namespace SniperRidge
{
    public sealed class MilitaryTownEnvironment:MonoBehaviour
    {
        readonly List<Light> lamps=new List<Light>();Material sky,forest,red,white;Transform player;float next;
        public static void Build(Transform parent,GameManager game)
        {
            var root=new GameObject("City greenery and checkpoint lights");root.transform.SetParent(parent,false);
            var town=root.AddComponent<MilitaryTownEnvironment>();town.player=game.Player.transform;town.Construct(game);
        }
        void Construct(GameManager game)
        {
            var rng=new System.Random(22915);
            if(AssaultLayout.Data.greenery!=null)foreach(var tree in AssaultLayout.Data.greenery)
            {
                Vegetation.Tree(transform,tree.Position,tree.scale,tree.pine?Vegetation.TreeType.Pine:Vegetation.TreeType.Broadleaf,rng);
                Vegetation.Bush(transform,tree.Position+new Vector3(.65f,0,.2f),.32f,rng);
            }
            // Low ground outside the boundary sits below the new distant city skyline.
            forest=ProceduralAssets.LitMaterial(new Color(.26f,.29f,.24f),0);forest.mainTexture=Resources.Load<Texture2D>("Terrain/forest_albedo");
            forest.mainTextureScale=new Vector2(24,24);
            for(int side=0;side<4;side++)
            {
                var pad=GameObject.CreatePrimitive(PrimitiveType.Plane);pad.name="Outer forest floor";pad.transform.SetParent(transform,false);
                pad.transform.position=new Vector3(side<2?(side==0?-208:208):0,AssaultLayout.Ground-.03f,side>=2?(side==2?-208:208):0);
                pad.transform.localScale=side<2?new Vector3(11.2f,1,52):new Vector3(30.4f,1,11.2f);pad.GetComponent<Renderer>().sharedMaterial=forest;
                pad.GetComponent<Collider>().enabled=false;Destroy(pad.GetComponent<Collider>());
            }
            red=Effects.Unlit(new Color(1f,.12f,.07f));white=Effects.Unlit(new Color(.75f,.87f,1));
            foreach(var objective in AssaultLayout.Objectives)
            {
                var pole=GameObject.CreatePrimitive(PrimitiveType.Cylinder);pole.transform.SetParent(transform,false);
                pole.name="Checkpoint floodlight mast";pole.transform.position=objective+new Vector3(4.2f,3.4f,0);pole.transform.localScale=new Vector3(.07f,3.4f,.07f);
                pole.GetComponent<Renderer>().sharedMaterial=Resources.Load<Material>("CityPack/Materials/Dark_Frame");
                // The existing objective cabinet provides solid cover underneath the thin decorative mast.
                pole.GetComponent<Collider>().enabled=false;Destroy(pole.GetComponent<Collider>());
                Lamp(objective+new Vector3(4.2f,6.8f,0),objective,white,new Color(.67f,.79f,1),false);
                Lamp(objective+new Vector3(-3f,1.2f,-6),objective,red,new Color(1,.10f,.04f),true);
            }
            // Early evening: warm low sunlight and enough sky fill to read enemies in alleys.
            RenderSettings.ambientMode=AmbientMode.Trilight;RenderSettings.ambientIntensity=1;
            RenderSettings.ambientSkyColor=new Color(.42f,.46f,.54f);RenderSettings.ambientEquatorColor=new Color(.34f,.36f,.40f);
            RenderSettings.ambientGroundColor=new Color(.22f,.23f,.23f);
            RenderSettings.fogColor=new Color(.44f,.46f,.51f);RenderSettings.fogDensity=.0018f;RenderSettings.reflectionIntensity=.14f;
            if(RenderSettings.sun!=null)
            {
                RenderSettings.sun.transform.rotation=Quaternion.Euler(24f,-35f,0f);
                RenderSettings.sun.color=new Color(1f,.84f,.68f);
                RenderSettings.sun.intensity=.85f;RenderSettings.sun.shadowStrength=.58f;
            }
            var skyShader=Shader.Find("Skybox/Procedural");
            if(skyShader!=null)
            {
                sky=new Material(skyShader);
                sky.SetFloat("_SunSize",.035f);sky.SetFloat("_AtmosphereThickness",1.05f);
                sky.SetColor("_SkyTint",new Color(.48f,.51f,.57f));
                sky.SetColor("_GroundColor",new Color(.37f,.40f,.44f));sky.SetFloat("_Exposure",1.05f);
                RenderSettings.skybox=sky;
            }
            var post=game.PlayerEye.GetComponent<PostEffect>();if(post!=null)post.ApplyPreset(PostPreset.EveningTown);
        }
        void Lamp(Vector3 position,Vector3 target,Material material,Color color,bool warning)
        {
            var bulb=GameObject.CreatePrimitive(PrimitiveType.Sphere);bulb.name=warning?"Red checkpoint beacon":"White floodlight";
            bulb.transform.SetParent(transform,false);bulb.transform.position=position;bulb.transform.localScale=Vector3.one*(warning?.20f:.27f);
            bulb.GetComponent<Renderer>().sharedMaterial=material;bulb.GetComponent<Collider>().enabled=false;Destroy(bulb.GetComponent<Collider>());
            var lamp=bulb.AddComponent<Light>();lamp.type=warning?LightType.Point:LightType.Spot;lamp.color=color;lamp.intensity=warning?2.5f:6;
            lamp.range=warning?8:28;lamp.spotAngle=95;lamp.transform.rotation=Quaternion.LookRotation(target-position);
            lamp.shadows=warning?LightShadows.None:LightShadows.Soft;lamp.shadowResolution=LightShadowResolution.Low;lamps.Add(lamp);
        }
        void Update()
        {
            if(player==null||Time.time<next)return;next=Time.time+.5f;
            foreach(var lamp in lamps)lamp.enabled=(lamp.transform.position-player.position).sqrMagnitude<65*65;
        }
        void OnDestroy()
        {
            if(sky!=null){if(RenderSettings.skybox==sky)RenderSettings.skybox=null;Destroy(sky);}
            if(forest!=null)Destroy(forest);if(red!=null)Destroy(red);if(white!=null)Destroy(white);
        }
    }
}
