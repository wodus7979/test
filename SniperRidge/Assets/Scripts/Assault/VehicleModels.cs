using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge
{
    public static class VehicleModels
    {
        [Serializable] class Part { public string name,material;public float[] positions,normals;public int[] triangles; }
        [Serializable] class Model { public Part[] parts; }
        static readonly Dictionary<string,Material> materials=new Dictionary<string,Material>();
        public static void Build(Transform root,bool van)
        {
            var source=Resources.Load<TextAsset>("Vehicles/"+(van?"van":"sedan"));
            if(source==null)throw new InvalidOperationException("차량 메시 데이터 누락: Vehicles");
            var model=JsonUtility.FromJson<Model>(source.text);
            foreach(var part in model.parts)
            {
                int count=part.positions.Length/3;
                var vertices=new Vector3[count];var normals=new Vector3[count];
                for(int i=0;i<count;i++)
                {
                    vertices[i]=new Vector3(part.positions[i*3],part.positions[i*3+1],part.positions[i*3+2]);
                    normals[i]=new Vector3(part.normals[i*3],part.normals[i*3+1],part.normals[i*3+2]);
                }
                var mesh=new Mesh{name=part.name,indexFormat=IndexFormat.UInt32};
                mesh.vertices=vertices;mesh.normals=normals;mesh.triangles=part.triangles;mesh.RecalculateBounds();
                var go=new GameObject(part.name,typeof(MeshFilter),typeof(MeshRenderer));go.transform.SetParent(root,false);
                go.GetComponent<MeshFilter>().sharedMesh=mesh;go.GetComponent<MeshRenderer>().sharedMaterial=MaterialFor(part.material,van);
                go.AddComponent<UrbanMeshOwner>().Mesh=mesh;
            }
            var collider=root.gameObject.AddComponent<BoxCollider>();
            collider.center=new Vector3(0,van?1f:.78f,0);collider.size=new Vector3(2.1f,van?2f:1.55f,4.55f);
        }
        static Material MaterialFor(string key,bool van)
        {
            string id=key+(van?"_van":"_sedan");
            if(materials.TryGetValue(id,out var found)&&found!=null)return found;
            // Opaque tinted glazing gives a solid cabin and controlled highlights without sorting artifacts.
            var m=new Material(Shader.Find("Standard")){name="Vehicle "+id};
            Color color;float smooth=.22f,metal=0;
            switch(key)
            {
                case "paint":color=van?new Color(.55f,.53f,.46f):new Color(.22f,.34f,.39f);metal=.25f;smooth=.32f;break;
                case "glass":color=new Color(.07f,.14f,.19f);smooth=.55f;metal=.2f;break;
                case "rubber":color=new Color(.045f,.05f,.055f);smooth=.08f;break;
                case "metal":color=new Color(.42f,.46f,.48f);metal=.75f;smooth=.4f;break;
                case "light":color=new Color(.78f,.85f,.84f);smooth=.45f;break;
                case "red":color=new Color(.52f,.055f,.045f);smooth=.38f;break;
                case "plate":color=new Color(.7f,.71f,.64f);break;
                default:color=new Color(.025f,.028f,.03f);smooth=.08f;break;
            }
            m.color=color;m.SetFloat("_Glossiness",smooth);m.SetFloat("_Metallic",metal);materials[id]=m;return m;
        }
    }
}
