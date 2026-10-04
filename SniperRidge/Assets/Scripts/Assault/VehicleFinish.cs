using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
namespace SniperRidge
{
    public static class VehicleFinish
    {
        static Material signMaterial;
        static readonly Dictionary<string,Material> cache=new Dictionary<string,Material>();
        public static Material MaterialFor(string part,string model)
        {
            string id=model+"/"+part;
            if(cache.TryGetValue(id,out var existing)&&existing)return existing;
            bool glazing=part=="busglass";
            var shader=Resources.Load<Shader>(glazing?"Shaders/VehicleGlass":"Shaders/VehicleSurface");
            if(!shader)throw new System.InvalidOperationException("Vehicle PBR shader missing");
            var mat=new Material(shader){name="PBR vehicle "+id,enableInstancing=true};
            Color color=new Color(.022f,.027f,.032f);float metal=0,smooth=.22f,dust=.07f,bump=.1f;
            switch(part)
            {
                case "paint":
                    color=model=="bus"?new Color(.96f,.65f,.025f):model=="suv"?new Color(.76f,.78f,.72f):model=="van"?new Color(.54f,.59f,.60f):new Color(.095f,.14f,.19f);
                    metal=model=="sedan"?.32f:.15f;smooth=.86f;dust=model=="suv"?.26f:.075f;bump=.065f;break;
                case "glass":color=new Color(.07f,.12f,.16f);smooth=.97f;metal=0;dust=.01f;bump=.01f;break;
                case "busglass":color=new Color(.08f,.14f,.17f,.4f);smooth=.96f;break;
                case "metal":color=new Color(.65f,.68f,.70f);metal=.95f;smooth=.83f;dust=.025f;bump=.055f;break;
                case "rubber":color=new Color(.027f,.030f,.033f);smooth=.16f;dust=.13f;bump=.55f;break;
                case "light":color=new Color(.8f,.88f,.94f);smooth=.91f;dust=0;mat.SetColor("_EmissionColor",new Color(.26f,.3f,.32f));break;
                case "red":color=new Color(.5f,.018f,.008f);smooth=.8f;mat.SetColor("_EmissionColor",new Color(.1f,.005f,0));break;
                case "amber":color=new Color(.9f,.29f,.009f);smooth=.7f;break;
                case "plate":color=new Color(.85f,.87f,.83f);smooth=.3f;break;
                case "seat":color=new Color(.075f,.16f,.24f);smooth=.19f;bump=.6f;dust=0;break;
                case "rail":color=new Color(.92f,.59f,.025f);smooth=.6f;dust=0;break;
            }
            mat.color=color;mat.SetFloat("_Glossiness",smooth);
            if(!glazing)
            {
                mat.SetFloat("_Metallic",metal);mat.SetFloat("_Weather",dust);mat.SetFloat("_BumpScale",bump);
                mat.SetTexture("_BumpMap",Resources.Load<Texture2D>("Vehicles/paint_micro_normal"));
                mat.SetTexture("_SurfaceMap",Resources.Load<Texture2D>("Vehicles/surface_mra"));
            }
            cache[id]=mat;return mat;
        }
        public static ReflectionProbe CreateReflectionProbe(Transform parent)
        {
            DynamicGI.UpdateEnvironment();
            var go=new GameObject("Vehicle environment reflection");go.transform.SetParent(parent,false);
            go.transform.position=new Vector3(0,AssaultLayout.Ground+4,0);
            var probe=go.AddComponent<ReflectionProbe>();probe.mode=ReflectionProbeMode.Realtime;
            probe.refreshMode=ReflectionProbeRefreshMode.OnAwake;probe.timeSlicingMode=ReflectionProbeTimeSlicingMode.IndividualFaces;
            probe.resolution=128;probe.hdr=true;probe.boxProjection=true;probe.size=new Vector3(400,80,400);
            probe.center=new Vector3(0,15,0);probe.nearClipPlane=.5f;probe.farClipPlane=200;probe.shadowDistance=35;probe.intensity=.8f;
            return probe;
        }
        static void Text(Transform root,string label,Vector3 p,Quaternion rotation,float height,Color color)
        {
            var go=new GameObject("Bus sign "+label);go.transform.SetParent(root,false);go.transform.localPosition=p;go.transform.localRotation=rotation;
            var text=go.AddComponent<TextMesh>();text.text=label;text.font=Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");text.fontSize=64;
            text.characterSize=height*10f/64f;text.anchor=TextAnchor.MiddleCenter;text.alignment=TextAlignment.Center;text.color=color;
            var renderer=go.GetComponent<MeshRenderer>();if(!signMaterial)signMaterial=new Material(Resources.Load<Shader>("Shaders/MetroSignText")){mainTexture=text.font.material.mainTexture};
            renderer.sharedMaterial=signMaterial;renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;
        }
        public static void AddBusSigns(Transform root)
        {
            Text(root,"42  DOWNTOWN",new Vector3(0,2.86f,5.178f),Quaternion.Euler(0,180,0),.19f,new Color(1,.82f,.12f));
            Text(root,"CITY TRANSIT",new Vector3(0,.98f,5.275f),Quaternion.Euler(0,180,0),.13f,new Color(.045f,.075f,.085f));
            Text(root,"CITY TRANSIT",new Vector3(-1.242f,.97f,-.4f),Quaternion.Euler(0,90,0),.19f,new Color(.045f,.075f,.085f));
            Text(root,"42",new Vector3(1.252f,2.58f,2.46f),Quaternion.Euler(0,-90,0),.20f,new Color(1,.82f,.12f));
        }
    }
}
