using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge
{
    /// <summary>Bounded, scene-owned impact decals clipped to visible geometry.
    /// No colliders, wall penetration, permanent scene edits or per-frame projection.</summary>
    public sealed class SurfaceImpactMarks : MonoBehaviour
    {
        public const int Capacity=256;
        static SurfaceImpactMarks instance;
        readonly Queue<GameObject> marks=new Queue<GameObject>();
        Material bullet,blast;Texture2D bulletTexture,blastTexture;
        int sequence;
        public int Count=>marks.Count;
        public static SurfaceImpactMarks Current=>instance;
        static SurfaceImpactMarks Get()
        {
            if(instance!=null)return instance;
            instance=new GameObject("Persistent surface impact marks").AddComponent<SurfaceImpactMarks>();
            instance.Initialize();return instance;
        }
        void Initialize()
        {
            var shader=Resources.Load<Shader>("Shaders/SurfaceImpactMark");
            bulletTexture=Texture(false);blastTexture=Texture(true);
            bullet=new Material(shader){name="Bullet chipped crater",mainTexture=bulletTexture};
            blast=new Material(shader){name="Explosion soot",mainTexture=blastTexture};
        }
        public static void Bullet(RaycastHit hit,float diameter=.20f)
        { if(Allowed(hit.collider))Get().Project(hit.collider,hit.point,hit.normal,Mathf.Clamp(diameter,.08f,.45f),false); }
        public static void Explosion(Vector3 centre,float scale)
        {
            // Short, occlusion-tested rays find the closest surrounding walls/ground.
            // Airbursts leave no floating mark when no solid surface is nearby.
            var contacts=new List<RaycastHit>();
            foreach(var direction in new[]{Vector3.down,Vector3.up,Vector3.left,Vector3.right,Vector3.forward,Vector3.back})
                if(Physics.Raycast(centre,direction,out var hit,3f*scale,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore)&&Allowed(hit.collider))contacts.Add(hit);
            contacts.Sort((a,b)=>a.distance.CompareTo(b.distance));
            var receivers=new HashSet<Collider>();int count=0;
            foreach(var hit in contacts)
            {
                if(!receivers.Add(hit.collider))continue;
                Get().Project(hit.collider,hit.point,hit.normal,Mathf.Clamp(2.6f*scale-hit.distance*.35f,1f,5f),true);
                if(++count==3)break;
            }
        }
        static bool Allowed(Collider collider)
            =>collider!=null&&!collider.isTrigger&&collider.GetComponentInParent<EnemySoldier>()==null
                &&collider.GetComponentInParent<SniperController>()==null&&collider.GetComponent<EnemyHitbox>()==null;
        static Transform Receiver(Collider collider)
        {
            var tank=collider.GetComponentInParent<TankVehicle>();if(tank!=null)return tank.transform;
            for(var t=collider.transform;t!=null;t=t.parent)
            {
                if(t.name=="Collision")return t.parent;
                if(t.GetComponent<Renderer>()!=null||t.GetComponent<Terrain>()!=null)return t;
                if(t.parent==null||t.parent.GetComponent<AssaultWorld>()!=null)break;
            }
            return collider.transform;
        }
        void Project(Collider collider,Vector3 point,Vector3 normal,float diameter,bool explosion)
        {
            normal.Normalize();float radius=diameter*.5f;
            var right=Vector3.Cross(Mathf.Abs(normal.y)>.9f?Vector3.forward:Vector3.up,normal).normalized;
            right=Quaternion.AngleAxis((sequence++*137.508f)%360,normal)*right;
            var up=Vector3.Cross(normal,right);
            var root=Receiver(collider);bool projected=false;
            var volume=new Bounds(point,Vector3.one*(diameter+1.2f));
            foreach(var filter in root.GetComponentsInChildren<MeshFilter>())
            {
                var renderer=filter.GetComponent<MeshRenderer>();var mesh=filter.sharedMesh;
                if(renderer==null||!renderer.enabled||renderer.forceRenderingOff||renderer.isPartOfStaticBatch||mesh==null||!mesh.isReadable||
                    filter.GetComponent<SurfaceImpactMark>()!=null||!renderer.bounds.Intersects(volume))continue;
                var lod=filter.GetComponentInParent<LODGroup>();
                if(lod!=null)
                {
                    var levels=lod.GetLODs();bool first=false;
                    if(levels.Length>0)foreach(var r in levels[0].renderers)if(r==renderer)first=true;
                    if(!first)continue;
                }
                var vertices=mesh.vertices;var triangles=mesh.triangles;
                var output=new List<Vector3>();var uv=new List<Vector2>();
                var polygon=new List<Vector3>(12);var scratch=new List<Vector3>(12);
                Matrix4x4 matrix=filter.transform.localToWorldMatrix;
                for(int i=0;i<triangles.Length;i+=3)
                {
                    Vector3 a=matrix.MultiplyPoint3x4(vertices[triangles[i]]),b=matrix.MultiplyPoint3x4(vertices[triangles[i+1]]),c=matrix.MultiplyPoint3x4(vertices[triangles[i+2]]);
                    Vector3 face=Vector3.Cross(b-a,c-a).normalized;
                    if(Vector3.Dot(face,normal)<.35f)continue;
                    a=ToProjection(a-point,right,up,normal);b=ToProjection(b-point,right,up,normal);c=ToProjection(c-point,right,up,normal);
                    // The visual city cladding can project slightly beyond its collision shell.
                    if(Mathf.Min(a.x,Mathf.Min(b.x,c.x))>radius||Mathf.Max(a.x,Mathf.Max(b.x,c.x))<-radius||
                       Mathf.Min(a.y,Mathf.Min(b.y,c.y))>radius||Mathf.Max(a.y,Mathf.Max(b.y,c.y))<-radius||
                       Mathf.Min(a.z,Mathf.Min(b.z,c.z))>.42f||Mathf.Max(a.z,Mathf.Max(b.z,c.z))<-.10f)continue;
                    polygon.Clear();polygon.Add(a);polygon.Add(b);polygon.Add(c);
                    for(int plane=0;plane<6&&polygon.Count>0;plane++)Clip(ref polygon,ref scratch,plane,radius);
                    for(int j=1;j+1<polygon.Count;j++)
                    {
                        Add(polygon[0],point,right,up,normal,radius,output,uv);
                        Add(polygon[j],point,right,up,normal,radius,output,uv);
                        Add(polygon[j+1],point,right,up,normal,radius,output,uv);
                    }
                    if(output.Count>9000)break;
                }
                if(output.Count>0){Store(filter.transform,output,uv,explosion);projected=true;}
            }
            // Terrain and statically batched primitives: sample only the actual hit collider.
            if(!projected)SampleCollider(collider,point,normal,right,up,radius,explosion);
        }
        static Vector3 ToProjection(Vector3 p,Vector3 x,Vector3 y,Vector3 z)=>new Vector3(Vector3.Dot(p,x),Vector3.Dot(p,y),Vector3.Dot(p,z));
        static float Distance(Vector3 p,int plane,float r)
        {
            switch(plane){case 0:return r-p.x;case 1:return r+p.x;case 2:return r-p.y;case 3:return r+p.y;case 4:return .42f-p.z;default:return .10f+p.z;}
        }
        static void Clip(ref List<Vector3> input,ref List<Vector3> output,int plane,float radius)
        {
            output.Clear();var previous=input[input.Count-1];float prev=Distance(previous,plane,radius);
            foreach(var current in input)
            {
                float next=Distance(current,plane,radius);
                if((prev>=0)!=(next>=0))output.Add(Vector3.Lerp(previous,current,prev/(prev-next)));
                if(next>=0)output.Add(current);previous=current;prev=next;
            }
            var swap=input;input=output;output=swap;
        }
        static void Add(Vector3 p,Vector3 origin,Vector3 right,Vector3 up,Vector3 normal,float radius,List<Vector3> vertices,List<Vector2> uv)
        {vertices.Add(origin+right*p.x+up*p.y+normal*(p.z+.004f));uv.Add(new Vector2(.5f+p.x/(radius*2),.5f+p.y/(radius*2)));}
        void SampleCollider(Collider collider,Vector3 origin,Vector3 normal,Vector3 right,Vector3 up,float radius,bool explosion)
        {
            int steps=explosion?12:4,stride=steps+1;var points=new Vector3[stride*stride];var valid=new bool[points.Length];var coords=new Vector2[points.Length];
            for(int y=0;y<=steps;y++)for(int x=0;x<=steps;x++)
            {
                int i=y*stride+x;coords[i]=new Vector2(x/(float)steps,y/(float)steps);
                Vector3 probe=origin+right*((coords[i].x-.5f)*radius*2)+up*((coords[i].y-.5f)*radius*2);
                if(collider.Raycast(new Ray(probe+normal*.45f,-normal),out var hit,.75f)&&Vector3.Dot(hit.normal,normal)>.45f)
                {points[i]=hit.point+hit.normal*.006f;valid[i]=true;}
            }
            var vertices=new List<Vector3>();var uv=new List<Vector2>();
            for(int y=0;y<steps;y++)for(int x=0;x<steps;x++)
            {
                int a=y*stride+x,b=a+1,c=a+stride+1,d=a+stride;
                foreach(var triangle in new[]{new[]{a,b,c},new[]{a,c,d}})
                    if(valid[triangle[0]]&&valid[triangle[1]]&&valid[triangle[2]])foreach(int i in triangle){vertices.Add(points[i]);uv.Add(coords[i]);}
            }
            if(vertices.Count>0)Store(collider.transform,vertices,uv,explosion);
        }
        void Store(Transform receiver,List<Vector3> points,List<Vector2> uv,bool explosion)
        {
            while(marks.Count>=Capacity){var oldest=marks.Dequeue();if(oldest!=null){oldest.SetActive(false);Destroy(oldest);}}
            var go=new GameObject(explosion?"Persistent blast scorch":"Persistent bullet hole",typeof(MeshFilter),typeof(MeshRenderer),typeof(SurfaceImpactMark));
            go.transform.SetParent(receiver,false);
            var indices=new int[points.Count];for(int i=0;i<points.Count;i++){points[i]=receiver.InverseTransformPoint(points[i]);indices[i]=i;}
            var mesh=new Mesh{name=go.name};mesh.SetVertices(points);mesh.SetUVs(0,uv);mesh.SetTriangles(indices,0);mesh.RecalculateBounds();
            go.GetComponent<MeshFilter>().sharedMesh=mesh;go.GetComponent<SurfaceImpactMark>().Mesh=mesh;
            var renderer=go.GetComponent<MeshRenderer>();renderer.sharedMaterial=explosion?blast:bullet;
            renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;marks.Enqueue(go);
        }
        static Texture2D Texture(bool explosion)
        {
            const int size=128;var pixels=new Color[size*size];
            for(int y=0;y<size;y++)for(int x=0;x<size;x++)
            {
                float px=(x+.5f)/size*2-1,py=(y+.5f)/size*2-1,r=Mathf.Sqrt(px*px+py*py),angle=Mathf.Atan2(py,px);
                float noise=Mathf.PerlinNoise(px*9+13,py*9+21),edge=r*(1+.13f*Mathf.Sin(angle*13)+.09f*Mathf.Sin(angle*23));
                float alpha,shade;
                if(explosion)
                {
                    alpha=(1-Mathf.SmoothStep(.20f,.99f,edge))*(.65f+noise*.30f);
                    shade=.02f+noise*.035f;
                }
                else
                {
                    float crater=1-Mathf.SmoothStep(.23f,.46f,edge);
                    float chip=Mathf.Exp(-Mathf.Pow((edge-.40f)/.16f,2))*(.4f+noise*.4f);
                    float crack=Mathf.Pow(Mathf.Max(0,Mathf.Cos(angle*11+r*5)),44)*(1-Mathf.SmoothStep(.3f,.94f,edge));
                    alpha=Mathf.Clamp01(crater*.94f+chip+crack*.9f);
                    shade=Mathf.Lerp(.32f,.025f,crater);
                }
                pixels[y*size+x]=new Color(shade,shade*.91f,shade*.78f,alpha);
            }
            var texture=new Texture2D(size,size,TextureFormat.RGBA32,true){name=explosion?"Soot falloff":"Chipped bullet crater",wrapMode=TextureWrapMode.Clamp,filterMode=FilterMode.Trilinear,anisoLevel=4};
            texture.SetPixels(pixels);texture.Apply(true,true);return texture;
        }
        void OnDestroy()
        {
            foreach(var mark in marks)if(mark!=null)Destroy(mark);
            Destroy(bullet);Destroy(blast);Destroy(bulletTexture);Destroy(blastTexture);
            if(instance==this)instance=null;
        }
    }
    public sealed class SurfaceImpactMark : MonoBehaviour
    {
        public Mesh Mesh;
        void OnDestroy(){if(Mesh!=null)Destroy(Mesh);}
    }
}
