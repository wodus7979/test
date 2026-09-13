using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge
{
    /// <summary>Authored geometry inspired by the supplied open-door utility helicopter reference.</summary>
    public static class HelicopterVisual
    {
        static Material olive, dark, steel, glass, rubber, canvas, warning;
        static void Materials()
        {
            if (olive != null) return;
            olive = SurfaceDetail.Make(Surface.PaintedMetal, new Color(.18f,.21f,.15f),.3f);
            dark = SurfaceDetail.Make(Surface.PaintedMetal, new Color(.045f,.055f,.05f),.25f);
            steel = SurfaceDetail.Make(Surface.Steel, new Color(.25f,.27f,.25f),.65f);
            glass = ProceduralAssets.LitMaterial(new Color(.10f,.19f,.23f),.85f);
            rubber = SurfaceDetail.Make(Surface.Rubber, new Color(.025f,.028f,.025f),.05f);
            canvas = SurfaceDetail.Make(Surface.Fabric, new Color(.24f,.27f,.21f),.12f);
            warning = SurfaceDetail.Make(Surface.PaintedMetal, new Color(.8f,.58f,.12f),.15f);
        }
        static GameObject Part(Transform parent, string name, Vector3 p, Vector3 size, Material mat,
            PrimitiveType type = PrimitiveType.Cube, Quaternion? rotation = null)
        {
            var go = GameObject.CreatePrimitive(type); go.name = name;
            go.transform.SetParent(parent, false); go.transform.localPosition = p;
            go.transform.localScale = size; go.transform.localRotation = rotation ?? Quaternion.identity;
            go.GetComponent<Renderer>().sharedMaterial = mat;
            // Interior/exterior visuals cannot intercept the door gun's rounds or sight ray.
            var collider = go.GetComponent<Collider>(); collider.enabled = false; Object.Destroy(collider);
            go.layer = 2;
            return go;
        }
        public static void Build(Transform root, out Transform rotor, out Transform tailRotor)
        {
            Materials();
            Part(root,"Armored cabin floor",new Vector3(0,-.18f,0),new Vector3(4.7f,.28f,4.8f),olive);
            Part(root,"Cabin roof",new Vector3(0,2.4f,0),new Vector3(4.4f,.24f,4.8f),olive);
            Part(root,"Left fuselage",new Vector3(-2.05f,1.1f,0),new Vector3(.22f,2.4f,4.8f),olive);
            Part(root,"Aft bulkhead",new Vector3(0,1.1f,-2.3f),new Vector3(4.3f,2.4f,.24f),olive);
            foreach (float z in new[] {-1.18f,1.18f})
            {
                Part(root,"Open door pillar",new Vector3(2.15f,1.12f,z),new Vector3(.22f,2.4f,.2f),dark);
                Part(root,"Sliding door panel",new Vector3(2.05f,1.1f,z*1.65f),new Vector3(.16f,2.35f,1.25f),olive);
                Part(root,"Door handhold",new Vector3(1.97f,1.55f,z),new Vector3(.07f,.52f,.07f),steel,PrimitiveType.Cylinder);
            }
            Part(root,"Door sill",new Vector3(2.22f,.02f,0),new Vector3(.38f,.16f,2.25f),dark);
            for (int i=0;i<9;i++)
                Part(root,"Anti-slip floor rib",new Vector3(.8f,-.025f,-1.8f+i*.45f),new Vector3(2.6f,.025f,.035f),steel);
            for (int i=0;i<6;i++)
                Part(root,"Sill hazard marking",new Vector3(2.32f,.108f,-.95f+i*.38f),new Vector3(.12f,.015f,.16f),warning);
            Part(root,"Ammunition case",new Vector3(.5f,.2f,-.8f),new Vector3(.75f,.42f,.55f),olive);
            Part(root,"Folded troop seat",new Vector3(-1.6f,.5f,-.25f),new Vector3(.65f,.14f,1.5f),canvas);
            Part(root,"Seat back",new Vector3(-1.87f,1f,-.25f),new Vector3(.12f,.9f,1.5f),canvas);
            Part(root,"Cockpit nose",new Vector3(0,.8f,3.05f),new Vector3(3.9f,2.4f,3f),olive,PrimitiveType.Sphere);
            foreach(float side in new[]{-1f,1f})
            {
                Part(root,"Pilot windshield",new Vector3(side*.9f,1.62f,3.92f),new Vector3(1.5f,.9f,.12f),glass,rotation:Quaternion.Euler(-24f,side*12f,0));
                Part(root,"Turbine housing",new Vector3(side*.85f,2.9f,-.1f),new Vector3(1f,.85f,3.3f),olive,PrimitiveType.Capsule,Quaternion.Euler(90f,0,0));
                Part(root,"Exhaust",new Vector3(side*.85f,2.9f,-1.95f),new Vector3(.6f,.35f,.6f),dark,PrimitiveType.Cylinder,Quaternion.Euler(90f,0,0));
                Part(root,"Landing strut",new Vector3(side*1.6f,-.72f,.4f),new Vector3(.12f,.55f,.12f),steel,PrimitiveType.Cylinder,Quaternion.Euler(0,0,side*18));
                Part(root,"Landing wheel",new Vector3(side*1.85f,-1.25f,.4f),new Vector3(.65f,.24f,.65f),rubber,PrimitiveType.Cylinder,Quaternion.Euler(0,0,90));
            }
            Part(root,"Tail boom",new Vector3(0,1.4f,-5.15f),new Vector3(.65f,.65f,6.6f),olive);
            Part(root,"Tail fin",new Vector3(0,2.5f,-8f),new Vector3(.18f,3.1f,1.1f),olive,rotation:Quaternion.Euler(-17f,0,0));
            Part(root,"Tail stabilizer",new Vector3(0,1.6f,-6.8f),new Vector3(3.5f,.12f,.85f),olive);
            var lamp = new GameObject("Cabin instrument light").AddComponent<Light>();
            lamp.transform.SetParent(root, false); lamp.transform.localPosition = new Vector3(.6f, 2f, .5f);
            lamp.type = LightType.Point; lamp.color = new Color(.78f, .88f, 1f);
            lamp.intensity = .65f; lamp.range = 5f; lamp.shadows = LightShadows.None;
            Part(root,"Rotor mast",new Vector3(0,3.48f,0),new Vector3(.18f,.48f,.18f),steel,PrimitiveType.Cylinder);
            rotor=new GameObject("Main rotor").transform;rotor.SetParent(root,false);rotor.localPosition=new Vector3(0,3.9f,0);
            for(int i=0;i<4;i++)
            {
                float angle=i*90f;var arm=new GameObject("Rotor arm").transform;arm.SetParent(rotor,false);arm.localRotation=Quaternion.Euler(0,angle,0);
                Part(arm,"Rotor blade",new Vector3(0,0,4.1f),new Vector3(.34f,.035f,7.8f),dark);
            }
            tailRotor=new GameObject("Tail rotor").transform;tailRotor.SetParent(root,false);tailRotor.localPosition=new Vector3(.45f,2.1f,-8.05f);
            for(int i=0;i<2;i++) Part(tailRotor,"Tail blade",Vector3.zero,new Vector3(.035f,2.5f,.13f),dark,rotation:Quaternion.Euler(i*90f,0,0));
        }
        public static GameObject BuildHeavyGun(Transform parent) => DoorGunView.Create(parent);
    }
}
