using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge
{
    /// <summary>Reusable original street props, built from shaped bodywork and detailed fittings.</summary>
    public static class UrbanProps
    {
        static readonly Dictionary<string,GameObject> templates=new Dictionary<string,GameObject>();
        static Material painted, glass, rubber, metal, lamp, cloth;
        static void Materials()
        {
            if(painted!=null)return;
            painted=new Material(Resources.Load<Material>("CityPack/Materials/Industrial_Blue"));painted.color=new Color(.26f,.32f,.33f);
            glass=new Material(Resources.Load<Material>("CityPack/Materials/Window_Glass"));glass.color=new Color(.07f,.12f,.14f);
            rubber=Resources.Load<Material>("CityPack/Materials/Rubber");metal=Resources.Load<Material>("CityPack/Materials/Metal_Silver");
            lamp=Resources.Load<Material>("CityPack/Materials/AC_White");cloth=new Material(Resources.Load<Material>("CityPack/Materials/Concrete"));cloth.color=new Color(.48f,.43f,.31f);
        }
        public static GameObject Place(string kind,Transform parent,Vector3 position,float yaw)
        {
            Materials();
            if(!templates.TryGetValue(kind,out var prototype)||prototype==null)
            {
                prototype=new GameObject("Street prop source "+kind);
                Build(prototype.transform,kind);Combine(prototype);
                prototype.SetActive(false);templates[kind]=prototype;
            }
            var go=Object.Instantiate(prototype,parent);go.name=kind;
            go.transform.SetPositionAndRotation(position,Quaternion.Euler(0,yaw,0));go.GetComponent<UrbanMeshOwner>().Mesh=null;go.SetActive(true);
            return go;
        }
        static void Build(Transform root,string kind)
        {
            if(kind=="Utility van" || kind=="Abandoned sedan")
            {
                bool van=kind=="Utility van";
                Part(root,new Vector3(0,.66f,0),new Vector3(1.92f,.65f,4.4f),painted);
                Part(root,new Vector3(0,.42f,0),new Vector3(1.80f,.18f,4.1f),rubber);
                if(van)
                {
                    Part(root,new Vector3(0,1.5f,-.65f),new Vector3(1.87f,1.15f,2.95f),painted);
                    Part(root,new Vector3(0,1.3f,1.1f),new Vector3(1.72f,.76f,1.2f),glass);
                    Part(root,new Vector3(0,1.72f,1.08f),new Vector3(1.9f,.10f,1.35f),painted);
                }
                else
                {
                    Part(root,new Vector3(0,1.13f,-.25f),new Vector3(1.62f,.62f,2.2f),glass);
                    Part(root,new Vector3(0,1.46f,-.35f),new Vector3(1.65f,.09f,1.5f),painted);
                    // Sloped front and rear glass, pillars, bumpers and door seams.
                    Part(root,new Vector3(0,1.14f,.89f),new Vector3(1.6f,.67f,.07f),glass,Quaternion.Euler(-24,0,0));
                }
                foreach(int side in new[]{-1,1})
                {
                    for(int axle=0;axle<2;axle++)
                    {
                        float z=axle==0?-1.4f:1.4f;
                        Part(root,new Vector3(side*.96f,.43f,z),new Vector3(.83f,.15f,.83f),rubber,Quaternion.Euler(0,0,90),PrimitiveType.Cylinder);
                        Part(root,new Vector3(side*1.12f,.43f,z),new Vector3(.49f,.012f,.49f),metal,Quaternion.Euler(0,0,90),PrimitiveType.Cylinder);
                        for(int bolt=0;bolt<5;bolt++)
                        {
                            float a=bolt*Mathf.PI*2/5;
                            Part(root,new Vector3(side*1.135f,.43f+Mathf.Cos(a)*.14f,z+Mathf.Sin(a)*.14f),Vector3.one*.044f,rubber);
                        }
                    }
                    for(int door=0;door<2;door++)
                    {
                        Part(root,new Vector3(side*.966f,.8f,-.7f+door*1.25f),new Vector3(.014f,.45f,.025f),rubber);
                        Part(root,new Vector3(side*.98f,.94f,-1+door*1.25f),new Vector3(.04f,.035f,.19f),metal);
                    }
                    Part(root,new Vector3(side*1.04f,1.15f,.65f),new Vector3(.23f,.13f,.24f),painted);
                    Part(root,new Vector3(side*.68f,.8f,2.22f),new Vector3(.46f,.17f,.04f),lamp);
                    Part(root,new Vector3(side*.68f,.75f,-2.22f),new Vector3(.35f,.15f,.04f),Resources.Load<Material>("CityPack/Materials/Safety_Red"));
                }
                Part(root,new Vector3(0,.50f,2.24f),new Vector3(1.8f,.15f,.12f),metal);
                Part(root,new Vector3(0,.52f,-2.24f),new Vector3(1.8f,.14f,.12f),rubber);
                Part(root,new Vector3(0,.69f,2.26f),new Vector3(.65f,.19f,.018f),rubber);
                var box=root.gameObject.AddComponent<BoxCollider>();box.center=new Vector3(0,van?1f:.78f,0);box.size=new Vector3(2.1f,van?2f:1.55f,4.55f);
            }
            else if(kind=="Sandbag corner")
            {
                for(int row=0;row<4;row++)for(int i=0;i<4;i++)
                    Part(root,new Vector3((i-1.5f)*.64f+(row%2)*.12f,.16f+row*.27f,0),new Vector3(.72f,.29f,.58f),cloth,Quaternion.identity,PrimitiveType.Sphere);
                var c=root.gameObject.AddComponent<BoxCollider>();c.center=new Vector3(.06f,.57f,0);c.size=new Vector3(2.8f,1.14f,.6f);
            }
            else if(kind=="Utility cabinet")
            {
                Part(root,new Vector3(0,.86f,0),new Vector3(1.05f,1.7f,.65f),painted);
                Part(root,new Vector3(0,.1f,0),new Vector3(1.2f,.2f,.8f),cloth);
                for(int i=0;i<8;i++)Part(root,new Vector3(0,.48f+i*.10f,.334f),new Vector3(.73f,.025f,.015f),rubber);
                Part(root,new Vector3(.36f,1.22f,.35f),new Vector3(.045f,.16f,.04f),metal);
                var c=root.gameObject.AddComponent<BoxCollider>();c.center=new Vector3(0,.85f,0);c.size=new Vector3(1.2f,1.7f,.8f);
            }
            else
            {
                Part(root,new Vector3(0,.57f,0),new Vector3(1.5f,1.0f,.95f),painted);
                Part(root,new Vector3(0,1.10f,0),new Vector3(1.6f,.12f,1.02f),rubber);
                for(int i=0;i<4;i++)Part(root,new Vector3((i%2==0?-1:1)*.59f,.12f,(i<2?-1:1)*.35f),Vector3.one*.18f,rubber,Quaternion.identity,PrimitiveType.Sphere);
                var c=root.gameObject.AddComponent<BoxCollider>();c.center=new Vector3(0,.59f,0);c.size=new Vector3(1.6f,1.18f,1.02f);
            }
        }
        static void Part(Transform root,Vector3 p,Vector3 size,Material mat,Quaternion? rotation=null,PrimitiveType shape=PrimitiveType.Cube)
        {
            var part=GameObject.CreatePrimitive(shape);part.transform.SetParent(root,false);part.transform.localPosition=p;part.transform.localScale=size;
            part.transform.localRotation=rotation??Quaternion.identity;
            var col=part.GetComponent<Collider>();col.enabled=false;Object.Destroy(col);
            part.GetComponent<Renderer>().sharedMaterial=mat;
        }
        static void Combine(GameObject root)
        {
            var groups=new Dictionary<Material,List<CombineInstance>>();
            foreach(var filter in root.GetComponentsInChildren<MeshFilter>())
            {
                var mat=filter.GetComponent<Renderer>().sharedMaterial;
                if(!groups.TryGetValue(mat,out var list))groups[mat]=list=new List<CombineInstance>();
                list.Add(new CombineInstance{mesh=filter.sharedMesh,transform=root.transform.worldToLocalMatrix*filter.transform.localToWorldMatrix});
            }
            var materials=new List<Material>();var pieces=new List<CombineInstance>();var meshes=new List<Mesh>();
            foreach(var pair in groups)
            {
                var mesh=new Mesh();mesh.CombineMeshes(pair.Value.ToArray(),true,true);meshes.Add(mesh);materials.Add(pair.Key);
                pieces.Add(new CombineInstance{mesh=mesh,transform=Matrix4x4.identity});
            }
            for(int i=root.transform.childCount-1;i>=0;i--){var child=root.transform.GetChild(i);child.gameObject.SetActive(false);child.SetParent(null);Object.Destroy(child.gameObject);}
            var combined=new Mesh{name=root.name,indexFormat=IndexFormat.UInt32};combined.CombineMeshes(pieces.ToArray(),false,false);
            root.AddComponent<MeshFilter>().sharedMesh=combined;root.AddComponent<MeshRenderer>().sharedMaterials=materials.ToArray();
            foreach(var mesh in meshes)Object.Destroy(mesh);
            // Only the template owns the shared mesh; placed copies must not destroy it.
            root.AddComponent<UrbanMeshOwner>().Mesh=combined;
        }
    }
    public sealed class UrbanMeshOwner:MonoBehaviour
    {
        [System.NonSerialized] public Mesh Mesh;
        void OnDestroy(){if(Mesh!=null)Destroy(Mesh);}
    }
}
