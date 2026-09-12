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
            glass.mainTexture=null; // Vehicle glass must not inherit the building's curtain atlas.
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
                VehicleModels.Build(root,kind=="Utility van");
            }
            else if(kind=="Sandbag corner")
            {
                for(int row=0;row<4;row++)for(int i=0;i<4;i++)
                    SandbagDetail.Build(root,row*4+i,new Vector3((i-1.5f)*.64f+(row%2)*.12f,.16f+row*.27f,0));
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
