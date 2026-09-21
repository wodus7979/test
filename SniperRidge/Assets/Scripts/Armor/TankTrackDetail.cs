using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    // Additional K2 geometry is visual only: the original collision and gun pivots stay intact.
    public sealed class TankTrackDetail : MonoBehaviour
    {
        const int Shoes=72;
        const float Radius=.535f, Straight=6.24f;
        const float Loop=2*Straight+2*Mathf.PI*Radius;
        readonly List<Vector3> vertices=new List<Vector3>(Shoes*2*24);
        readonly List<Vector3> normals=new List<Vector3>(Shoes*2*24);
        readonly List<Vector2> uvs=new List<Vector2>(Shoes*2*24);
        readonly List<int> indices=new List<int>(Shoes*2*36);
        Mesh tracks,fittings;
        Material steel;
        TankVehicle vehicle;
        Vector3 lastPosition;
        Quaternion lastRotation;
        float leftPhase,rightPhase,elapsed;
        static readonly Vector3[] FaceNormals={Vector3.right,Vector3.left,Vector3.up,Vector3.down,Vector3.forward,Vector3.back};
        static readonly Vector3[] Corners={
            new Vector3(1,-1,-1),new Vector3(1,1,-1),new Vector3(1,1,1),new Vector3(1,-1,1),
            new Vector3(-1,-1,1),new Vector3(-1,1,1),new Vector3(-1,1,-1),new Vector3(-1,-1,-1),
            new Vector3(-1,1,-1),new Vector3(-1,1,1),new Vector3(1,1,1),new Vector3(1,1,-1),
            new Vector3(-1,-1,1),new Vector3(-1,-1,-1),new Vector3(1,-1,-1),new Vector3(1,-1,1),
            new Vector3(1,-1,1),new Vector3(1,1,1),new Vector3(-1,1,1),new Vector3(-1,-1,1),
            new Vector3(-1,-1,-1),new Vector3(-1,1,-1),new Vector3(1,1,-1),new Vector3(1,-1,-1)};
        public void Initialize(Material trackMaterial)
        {
            steel=trackMaterial;vehicle=GetComponent<TankVehicle>();lastPosition=transform.position;lastRotation=transform.rotation;
            tracks=new Mesh{name="K2 individual track shoes"};tracks.MarkDynamic();
            AddRenderer("Moving steel track shoes",tracks);
            BuildTracks();
            Clear();
            // Bolts along the upper edge of the side skirts, modeled as short hexagonal heads.
            for(int side=-1;side<=1;side+=2)
                for(int i=0;i<13;i++)Bolt(new Vector3(side*1.935f,1.20f,-3.08f+i*.50f),Vector3.right*side,.035f,.022f);
            fittings=new Mesh{name="K2 skirt fasteners"};Write(fittings);AddRenderer("Skirt fasteners",fittings);
        }
        void AddRenderer(string name,Mesh mesh)
        {
            var go=new GameObject(name);go.transform.SetParent(transform,false);
            go.AddComponent<MeshFilter>().sharedMesh=mesh;var renderer=go.AddComponent<MeshRenderer>();renderer.sharedMaterial=steel;
            var group=GetComponent<LODGroup>();
            if(group!=null)
            {
                var lods=group.GetLODs();var near=new List<Renderer>(lods[0].renderers){renderer};
                lods[0].renderers=near.ToArray();group.SetLODs(lods);group.RecalculateBounds();
            }
        }
        void LateUpdate()
        {
            if(tracks==null||vehicle==null||vehicle.IsDead)return;
            Vector3 movement=transform.position-lastPosition;
            float scale=Mathf.Max(.001f,transform.lossyScale.x);
            float travel=Vector3.Dot(movement,transform.forward)/scale;
            float turn=Vector3.SignedAngle(lastRotation*Vector3.forward,transform.forward,transform.up)*Mathf.Deg2Rad*1.7f;
            lastPosition=transform.position;lastRotation=transform.rotation;
            leftPhase=Mathf.Repeat(leftPhase+travel+turn,Loop);rightPhase=Mathf.Repeat(rightPhase+travel-turn,Loop);
            elapsed+=Time.deltaTime;
            if(elapsed<1f/30f||Mathf.Abs(travel)+Mathf.Abs(turn)<.0001f)return;
            elapsed=0;BuildTracks();
        }
        void BuildTracks()
        {
            Clear();
            for(int side=-1;side<=1;side+=2)
            for(int i=0;i<Shoes;i++)
            {
                float t=Mathf.Repeat(i*Loop/Shoes+(side<0?leftPhase:rightPhase),Loop);
                float y,z;Vector3 tangent;
                if(t<Straight){y=Radius;z=-Straight*.5f+t;tangent=Vector3.forward;}
                else if(t<Straight+Mathf.PI*Radius)
                {
                    float a=(t-Straight)/Radius;y=Radius*Mathf.Cos(a);z=Straight*.5f+Radius*Mathf.Sin(a);
                    tangent=new Vector3(0,-Mathf.Sin(a),Mathf.Cos(a));
                }
                else if(t<2*Straight+Mathf.PI*Radius)
                {y=-Radius;z=Straight*.5f-(t-Straight-Mathf.PI*Radius);tangent=Vector3.back;}
                else
                {
                    float a=(t-2*Straight-Mathf.PI*Radius)/Radius;y=-Radius*Mathf.Cos(a);z=-Straight*.5f-Radius*Mathf.Sin(a);
                    tangent=new Vector3(0,Mathf.Sin(a),-Mathf.Cos(a));
                }
                Vector3 normal=Vector3.Cross(tangent,Vector3.right);
                Box(new Vector3(side*1.69f,y+.56f,z),Quaternion.LookRotation(tangent,normal),new Vector3(.35f,.045f,.15f));
            }
            Write(tracks);
        }
        void Box(Vector3 centre,Quaternion rotation,Vector3 size)
        {
            int start=vertices.Count;
            for(int i=0;i<24;i++)
            {vertices.Add(centre+rotation*Vector3.Scale(Corners[i],size*.5f));normals.Add(rotation*FaceNormals[i/4]);uvs.Add(new Vector2(i%2,(i/2)%2));}
            for(int face=0;face<6;face++)
            {int a=start+face*4;indices.Add(a);indices.Add(a+1);indices.Add(a+2);indices.Add(a);indices.Add(a+2);indices.Add(a+3);}
        }
        void Bolt(Vector3 centre,Vector3 axis,float radius,float depth)
        {
            var rotation=Quaternion.FromToRotation(Vector3.forward,axis);
            for(int i=0;i<6;i++)
            {
                float a=i*Mathf.PI/3,b=(i+1)*Mathf.PI/3;
                Vector3 p=new Vector3(Mathf.Cos(a)*radius,Mathf.Sin(a)*radius,0),q=new Vector3(Mathf.Cos(b)*radius,Mathf.Sin(b)*radius,0);
                Triangle(centre+axis*depth,centre+rotation*(p+Vector3.forward*depth),centre+rotation*(q+Vector3.forward*depth));
                Triangle(centre+rotation*p,centre+rotation*q,centre+rotation*(q+Vector3.forward*depth));
                Triangle(centre+rotation*p,centre+rotation*(q+Vector3.forward*depth),centre+rotation*(p+Vector3.forward*depth));
            }
        }
        void Triangle(Vector3 a,Vector3 b,Vector3 c)
        {
            int n=vertices.Count;Vector3 normal=Vector3.Cross(b-a,c-a).normalized;
            vertices.Add(a);vertices.Add(b);vertices.Add(c);
            for(int i=0;i<3;i++){normals.Add(normal);uvs.Add(Vector2.zero);indices.Add(n+i);}
        }
        void Clear(){vertices.Clear();normals.Clear();uvs.Clear();indices.Clear();}
        void Write(Mesh mesh){mesh.Clear();mesh.SetVertices(vertices);mesh.SetNormals(normals);mesh.SetUVs(0,uvs);mesh.SetTriangles(indices,0);mesh.RecalculateBounds();}
        void OnDestroy(){Release(tracks);Release(fittings);}
        static void Release(Object o){if(o==null)return;if(Application.isPlaying)Destroy(o);else DestroyImmediate(o);}
    }
}
