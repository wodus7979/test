using System;
using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge
{
    public static class VehicleModels
    {
        [Serializable] class Part { public string name,material;public float[] positions,normals;public int[] triangles; }
        [Serializable] class Model { public Part[] parts; }
        public static void Build(Transform root,string modelName)
        {
            var source=Resources.Load<TextAsset>("Vehicles/"+modelName);
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
                var uv=new Vector2[count];
                for(int i=0;i<count;i++)
                {
                    var n=normals[i];var v=vertices[i];
                    uv[i]=Mathf.Abs(n.y)>.6f?new Vector2(v.x,v.z):Mathf.Abs(n.x)>.6f?new Vector2(v.z,v.y):new Vector2(v.x,v.y);
                }
                mesh.vertices=vertices;mesh.normals=normals;mesh.uv=uv;mesh.triangles=part.triangles;mesh.RecalculateTangents();mesh.RecalculateBounds();
                var go=new GameObject(part.name,typeof(MeshFilter),typeof(MeshRenderer));go.transform.SetParent(root,false);
                go.GetComponent<MeshFilter>().sharedMesh=mesh;go.GetComponent<MeshRenderer>().sharedMaterial=VehicleFinish.MaterialFor(part.material,modelName);
                go.AddComponent<UrbanMeshOwner>().Mesh=mesh;

            }

            // UrbanProps.Combine assigns the final visible mesh after merging the parts.
            root.gameObject.AddComponent<MeshCollider>();
        }
    }
}
