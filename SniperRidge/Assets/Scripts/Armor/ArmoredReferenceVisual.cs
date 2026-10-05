using UnityEngine;
using System.Linq;

namespace SniperRidge
{
    // Runtime attachments are isolated to the player. Enemy tank source prefabs remain untouched.
    public static class ArmoredReferenceVisual
    {
        static Material armor,steel,rubber,glass;
        static void Materials()
        {
            if(armor)return;
            armor=SurfaceDetail.Make(Surface.PaintedMetal,new Color(.28f,.34f,.24f),.34f,.1f);armor.name="Reference armor camo";
            steel=SurfaceDetail.Make(Surface.Steel,new Color(.23f,.25f,.22f),.45f,.72f);steel.name="Reference bare steel";
            rubber=SurfaceDetail.Make(Surface.Rubber,new Color(.05f,.055f,.045f),.12f);rubber.name="Reference rubber";
            glass=ProceduralAssets.LitMaterial(new Color(.06f,.12f,.14f),.85f);glass.name="Reference optic glass";
        }
        public static GameObject Part(Transform root,string name,Vector3 p,Vector3 size,Material m,PrimitiveType type=PrimitiveType.Cube,Quaternion? rot=null)
        {
            var go=GameObject.CreatePrimitive(type);go.name=name;go.transform.SetParent(root,false);go.transform.localPosition=p;go.transform.localScale=size;go.transform.localRotation=rot??Quaternion.identity;
            var c=go.GetComponent<Collider>();c.enabled=false;Object.Destroy(c);go.GetComponent<Renderer>().sharedMaterial=m;return go;
        }
        // Eight-point bevel profile produces sloped armor faces rather than stacked square blocks.
        public static GameObject Hull(Transform root,string name,Vector3 position,Vector3 size,Material mat,float taper=.72f)
        {
            var go=new GameObject(name,typeof(MeshFilter),typeof(MeshRenderer));go.transform.SetParent(root,false);go.transform.localPosition=position;
            Vector2[] edge={new Vector2(-.35f,-.5f),new Vector2(.35f,-.5f),new Vector2(.5f,-.32f),new Vector2(.5f,.32f),new Vector2(.35f,.5f),new Vector2(-.35f,.5f),new Vector2(-.5f,.32f),new Vector2(-.5f,-.32f)};
            var points=new System.Collections.Generic.List<Vector3>();var uv=new System.Collections.Generic.List<Vector2>();var triangles=new System.Collections.Generic.List<int>();
            System.Action<Vector3,Vector3,Vector3,Vector3> quad=(a,b,c,d)=>{int n=points.Count;points.AddRange(new[]{a,b,c,d});uv.AddRange(new[]{Vector2.zero,Vector2.right,Vector2.one,Vector2.up});triangles.AddRange(new[]{n,n+1,n+2});if((d-a).sqrMagnitude>.000001f)triangles.AddRange(new[]{n,n+2,n+3});};
            for(int i=0;i<8;i++){int j=(i+1)%8;Vector3 a=new Vector3(edge[i].x*size.x,0,edge[i].y*size.z),b=new Vector3(edge[j].x*size.x,0,edge[j].y*size.z);Vector3 c=new Vector3(b.x*taper,size.y,b.z*taper),d=new Vector3(a.x*taper,size.y,a.z*taper);quad(a,d,c,b);quad(Vector3.up*size.y,c,d,Vector3.up*size.y);quad(Vector3.zero,a,b,Vector3.zero);}
            var mesh=new Mesh{name=name};mesh.SetVertices(points);mesh.SetUVs(0,uv);mesh.SetTriangles(triangles,0);mesh.RecalculateNormals();mesh.RecalculateTangents();go.AddComponent<RuntimeArmorMesh>().Mesh=mesh;
            go.GetComponent<MeshFilter>().sharedMesh=mesh;go.GetComponent<Renderer>().sharedMaterial=mat;return go;
        }
        static Transform Node(Transform root,string name,Vector3 p){var t=new GameObject(name).transform;t.SetParent(root,false);t.localPosition=p;return t;}
        public static Transform Refit(TankVehicle tank)
        {
            Materials();var root=tank.transform;var turret=root.Find("Turret");
            var replaced=turret.GetComponentsInChildren<Renderer>().Where(r=>!r.transform.IsChildOf(turret.Find("Barrel"))).ToArray();
            foreach(var r in replaced){r.enabled=false;r.gameObject.SetActive(false);}
            var lod=root.GetComponent<LODGroup>();if(lod){var levels=lod.GetLODs();for(int i=0;i<levels.Length;i++)levels[i].renderers=levels[i].renderers.Where(r=>!replaced.Contains(r)).ToArray();lod.SetLODs(levels);}
            Hull(turret,"Wedge composite turret",new Vector3(0,-.05f,-.2f),new Vector3(3.9f,1.12f,4.5f),armor,.78f);
            foreach(float side in new[]{-1f,1f})
            {
                Hull(turret,"Sloped cheek module",new Vector3(side*1.15f,.10f,1.0f),new Vector3(1.5f,.7f,2.3f),armor,.68f);
                for(int i=0;i<5;i++)
                {
                    Part(root,"Skirt armor panel",new Vector3(side*1.97f,1.13f,-2.55f+i*1.17f),new Vector3(.13f,.88f,1.1f),armor,rot:Quaternion.Euler(0,0,side*4));
                    foreach(float z in new[]{-.40f,.40f})Part(root,"Skirt fastener",new Vector3(side*2.05f,1.40f,-2.55f+i*1.17f+z),Vector3.one*.065f,steel,PrimitiveType.Sphere);
                }
                Part(turret,"Optic housing",new Vector3(side*.86f,1.27f,-.25f),new Vector3(.55f,.5f,.6f),armor);
                Part(turret,"Optic lens",new Vector3(side*.86f,1.29f,.058f),new Vector3(.28f,.22f,.014f),glass);
                for(int i=0;i<3;i++)Part(turret,"Smoke grenade tube",new Vector3(side*1.65f,.6f,1.2f-i*.22f),new Vector3(.13f,.23f,.13f),steel,PrimitiveType.Cylinder,Quaternion.Euler(-60,side*25,0));
                Part(root,"Rear fuel drum",new Vector3(side*1.2f,1.5f,-3.9f),new Vector3(.65f,.65f,.65f),armor,PrimitiveType.Cylinder,Quaternion.Euler(0,0,90));
            }
            Part(turret,"Commander hatch",new Vector3(-.5f,1.17f,-.6f),new Vector3(.9f,.055f,.9f),steel,PrimitiveType.Cylinder);
            var remote=Node(turret,"Remote weapon station",new Vector3(-.48f,1.25f,-.55f));
            Hull(remote,"Machine gun shield",Vector3.zero,new Vector3(.6f,.45f,.8f),armor);
            Part(remote,"Machine gun barrel",new Vector3(0,.32f,.85f),new Vector3(.075f,.7f,.075f),steel,PrimitiveType.Cylinder,Quaternion.Euler(90,0,0));
            var pod=Node(turret,"Player rocket pod",new Vector3(1.75f,.72f,-.62f));
            Hull(pod,"Rocket armored housing",new Vector3(0,-.32f,-.1f),new Vector3(.94f,.85f,1.45f),armor,.9f);
            for(int x=0;x<2;x++)for(int y=0;y<3;y++)
            {var p=new Vector3((x-.5f)*.32f,(y-1)*.24f,.62f);Part(pod,"Launch tube rim",p,new Vector3(.25f,.09f,.25f),steel,PrimitiveType.Cylinder,Quaternion.Euler(90,0,0));Part(pod,"Dark open launch bore",p+Vector3.forward*.1f,new Vector3(.19f,.01f,.19f),rubber,PrimitiveType.Cylinder,Quaternion.Euler(90,0,0));}
            var gun=turret.Find("Barrel");
            Part(gun,"Thermal barrel jacket",new Vector3(0,0,2.1f),new Vector3(.30f,1.7f,.30f),armor,PrimitiveType.Cylinder,Quaternion.Euler(90,0,0));
            Part(gun,"Bore evacuator",new Vector3(0,0,2.5f),new Vector3(.48f,.40f,.48f),armor,PrimitiveType.Cylinder,Quaternion.Euler(90,0,0));
            foreach(float z in new[]{.9f,1.25f,3.5f,4.8f})Part(gun,"Barrel sleeve seam",new Vector3(0,0,z),new Vector3(.32f,.025f,.32f),steel,PrimitiveType.Cylinder,Quaternion.Euler(90,0,0));
            Part(root,"Sloped glacis armor",new Vector3(0,.95f,3.22f),new Vector3(2.8f,.16f,.9f),armor,rot:Quaternion.Euler(28,0,0));
            foreach(float side in new[]{-1f,1f})
            {
                Part(root,"Headlight protective housing",new Vector3(side*1.48f,1.35f,3.05f),new Vector3(.35f,.25f,.24f),steel);
                Part(root,"Headlight lens",new Vector3(side*1.48f,1.35f,3.19f),new Vector3(.20f,.14f,.025f),glass);
                for(int i=0;i<6;i++)Part(root,"Rear stowage rail",new Vector3(side*1.82f,1.9f,-2.7f+i*.19f),new Vector3(.07f,.38f,.045f),steel);
                Part(root,"Tow attachment",new Vector3(side*.9f,.7f,3.55f),new Vector3(.18f,.21f,.23f),steel);
            }
            for(int i=0;i<16;i++)Part(root,"Engine deck grille",new Vector3(-.72f+i*.095f,1.65f,-2.9f),new Vector3(.04f,.035f,1f),rubber);
            return Node(pod,"Rocket muzzle",new Vector3(0,0,.9f));
        }
        static void Airframe(Transform root)
        {
            // Elliptic cross-sections form the chin, cabin and tapered engine bay.
            var shape=new[]{new Vector4(-3.2f,.26f,.31f,.08f),new Vector4(-2.2f,.64f,.63f,.1f),new Vector4(-.7f,.84f,.76f,.12f),new Vector4(1f,.73f,.78f,.1f),new Vector4(2.3f,.61f,.61f,.03f),new Vector4(3.15f,.40f,.34f,-.05f),new Vector4(3.55f,.08f,.12f,-.1f)};
            const int sides=20;var vertices=new Vector3[shape.Length*sides];var uv=new Vector2[vertices.Length];var indices=new System.Collections.Generic.List<int>();
            for(int j=0;j<shape.Length;j++)for(int i=0;i<sides;i++)
            {
                float a=i*Mathf.PI*2/sides;var section=shape[j];int n=j*sides+i;
                vertices[n]=new Vector3(Mathf.Cos(a)*section.y,Mathf.Sin(a)*section.z+section.w,section.x);uv[n]=new Vector2(i/(float)sides,j/(float)(shape.Length-1));
                if(j<shape.Length-1){int b=j*sides+(i+1)%sides;indices.AddRange(new[]{n,b,n+sides,b,b+sides,n+sides});}
            }
            var mesh=new Mesh{name="Attack helicopter curved airframe"};mesh.vertices=vertices;mesh.uv=uv;mesh.SetTriangles(indices,0);mesh.RecalculateNormals();mesh.RecalculateTangents();
            var go=new GameObject("Curved attack airframe",typeof(MeshFilter),typeof(MeshRenderer));go.transform.SetParent(root,false);go.GetComponent<MeshFilter>().sharedMesh=mesh;go.GetComponent<Renderer>().sharedMaterial=armor;go.AddComponent<RuntimeArmorMesh>().Mesh=mesh;
        }
        public static void Gunship(Transform root,out Transform rotor,out Transform tail,out Transform muzzle,out Transform rocket)
        {
            Materials();Airframe(root);
            Hull(root,"Tandem cockpit glazing",new Vector3(0,.5f,1.45f),new Vector3(1.25f,1.05f,3f),glass,.50f);
            for(int i=0;i<3;i++)Part(root,"Cockpit frame",new Vector3(0,.82f,.5f+i*.95f),new Vector3(1.27f,.065f,.075f),steel,rot:Quaternion.Euler(0,0,0));
            foreach(float side in new[]{-1f,1f})
            {
                Part(root,"Turbine armor",new Vector3(side*.84f,.85f,-.6f),new Vector3(.7f,1.25f,.7f),armor,PrimitiveType.Capsule,Quaternion.Euler(90,0,0));
                Part(root,"Exhaust soot",new Vector3(side*.84f,.86f,-1.91f),new Vector3(.40f,.05f,.40f),rubber,PrimitiveType.Cylinder,Quaternion.Euler(90,0,0));
                Hull(root,"Weapons stub wing",new Vector3(side*1.1f,-.12f,-.15f),new Vector3(2f,.16f,1.1f),armor,.8f);
                Part(root,"Rocket pod",new Vector3(side*1.75f,-.42f,.18f),new Vector3(.55f,.75f,.55f),steel,PrimitiveType.Cylinder,Quaternion.Euler(90,0,0));
                for(int i=0;i<7;i++){float a=i*Mathf.PI*2/6;Part(root,"Rocket bore",new Vector3(side*1.75f+Mathf.Cos(a)*.17f,-.42f+Mathf.Sin(a)*.17f,.95f),new Vector3(.095f,.015f,.095f),rubber,PrimitiveType.Cylinder,Quaternion.Euler(90,0,0));}
                for(int i=0;i<2;i++)Part(root,"Air-ground missile",new Vector3(side*(2.05f+i*.23f),-.5f,-.1f),new Vector3(.13f,.8f,.13f),steel,PrimitiveType.Cylinder,Quaternion.Euler(90,0,0));
                Part(root,"Main landing strut",new Vector3(side*.75f,-.85f,.55f),new Vector3(.10f,.8f,.10f),steel,PrimitiveType.Cylinder,Quaternion.Euler(0,0,-side*25));
                Part(root,"Landing tire",new Vector3(side*1.05f,-1.2f,.55f),new Vector3(.55f,.15f,.55f),rubber,PrimitiveType.Cylinder,Quaternion.Euler(0,0,90));
            }
            Hull(root,"Tapered tail boom",new Vector3(0,.08f,-4.3f),new Vector3(.5f,.55f,5f),armor,.7f);
            Part(root,"Vertical tail",new Vector3(0,1.2f,-6.35f),new Vector3(.13f,2.1f,1.15f),armor,rot:Quaternion.Euler(-20,0,0));
            Part(root,"Tailplane",new Vector3(0,.45f,-5.1f),new Vector3(2.6f,.10f,.75f),armor);
            Part(root,"Radar mast",new Vector3(0,1.75f,-.5f),new Vector3(.16f,.9f,.16f),steel,PrimitiveType.Cylinder);
            Part(root,"Radar dome",new Vector3(0,2.35f,-.5f),new Vector3(1.3f,.45f,.85f),rubber,PrimitiveType.Sphere);
            rotor=Node(root,"Attack main rotor",new Vector3(0,1.7f,-.5f));
            for(int i=0;i<4;i++){var arm=Node(rotor,"Rotor arm",Vector3.zero);arm.localRotation=Quaternion.Euler(0,i*90,0);Part(arm,"Rotor blade",new Vector3(0,0,2.9f),new Vector3(.28f,.045f,5.6f),steel);}
            tail=Node(root,"Tail rotor",new Vector3(.36f,1.1f,-6.3f));for(int i=0;i<2;i++)Part(tail,"Tail blade",Vector3.zero,new Vector3(.04f,2,.15f),steel,rot:Quaternion.Euler(i*90,0,0));
            Part(root,"Chin turret",new Vector3(0,-.55f,2.2f),new Vector3(.65f,.65f,.65f),steel,PrimitiveType.Sphere);
            Part(root,"Chain gun",new Vector3(0,-.62f,3),new Vector3(.13f,.7f,.13f),steel,PrimitiveType.Cylinder,Quaternion.Euler(90,0,0));
            muzzle=Node(root,"Gun muzzle",new Vector3(0,-.62f,3.7f));rocket=Node(root,"Rocket muzzle",new Vector3(1.75f,-.42f,1.2f));
            root.gameObject.AddComponent<TankAppearanceDetail>().Initialize(new Color(.25f,.29f,.21f),true);
        }
    }
    public sealed class RuntimeArmorMesh:MonoBehaviour
    {public Mesh Mesh;void OnDestroy(){if(Mesh){if(Application.isPlaying)Destroy(Mesh);else DestroyImmediate(Mesh);}}}
}
