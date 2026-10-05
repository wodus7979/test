using UnityEngine;
using System.Collections.Generic;

namespace SniperRidge
{
    public sealed class RampageProp:MonoBehaviour
    {
        public bool Tree { get; private set; }
        public bool Available { get; private set; }=true;
        public static void Populate(TankRampage owner)
        {
            var rng=new System.Random(58392);var gm=GameManager.Instance;
            for(int i=0;i<36;i++)
            {
                Vector2 node=TankCanyon.Node(i%TankCanyon.NodeCount);
                float a=(float)rng.NextDouble()*Mathf.PI*2;
                var p=TankCanyon.Ground(gm.Terrain,node+new Vector2(Mathf.Sin(a),Mathf.Cos(a))*(11+i%3*2));
                if(Mathf.Abs(p.x)>TankBattle.Bounds-5||Mathf.Abs(p.z)>TankBattle.Bounds-5||TankCanyon.RoadDistance(p.x,p.z)<7)continue;
                if(Physics.CheckSphere(p+Vector3.up*2,1.5f,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))continue;
                Create(owner.transform,p,i%3!=0,rng);
            }
            // Separate scatter budget for throwable stones; preserve broad road corridors.
            var placed=new List<Vector3>();
            for(int attempt=0;attempt<1800&&placed.Count<80;attempt++)
            {
                Vector2 point;
                if(attempt%2==0)
                {
                    float angle=(float)rng.NextDouble()*Mathf.PI*2;
                    point=TankCanyon.Node(attempt%TankCanyon.NodeCount)+new Vector2(Mathf.Sin(angle),Mathf.Cos(angle))*(10+(float)rng.NextDouble()*20);
                }
                else point=new Vector2((float)rng.NextDouble()*180-90,(float)rng.NextDouble()*180-90);
                var p=TankCanyon.Ground(gm.Terrain,point);
                if(Mathf.Abs(p.x)>TankBattle.Bounds-6||Mathf.Abs(p.z)>TankBattle.Bounds-6||TankCanyon.RoadDistance(p.x,p.z)<8)continue;
                if(placed.Exists(other=>(other-p).sqrMagnitude<25))continue;
                if(Physics.CheckSphere(p+Vector3.up*1.6f,1.4f,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))continue;
                Create(owner.transform,p,false,rng);placed.Add(p);
            }
        }
        public static RampageProp Create(Transform parent,Vector3 p,bool tree,System.Random rng=null)
        {
            GameObject go;
            if(tree)
            {
                go=Vegetation.CoverTree(parent,p,.75f,.68f);go.name="Uprootable thick tree";
            }
            else
            {
                go=GameObject.CreatePrimitive(PrimitiveType.Sphere);go.name="Liftable boulder";go.transform.SetParent(parent,true);go.transform.position=p+Vector3.up*.55f;
                go.transform.localScale=new Vector3(1.75f,1.4f,1.55f);
                var mesh=Instantiate(go.GetComponent<MeshFilter>().sharedMesh);mesh.name="Rough liftable stone";
                var vertices=mesh.vertices;
                for(int i=0;i<vertices.Length;i++){var v=vertices[i];vertices[i]=v*(.82f+.32f*Mathf.PerlinNoise(v.x*6+4,v.y*6+v.z*3));}
                mesh.vertices=vertices;mesh.RecalculateNormals();mesh.RecalculateBounds();go.GetComponent<MeshFilter>().sharedMesh=mesh;go.AddComponent<RuntimeArmorMesh>().Mesh=mesh;
                go.GetComponent<Renderer>().sharedMaterial=SurfaceDetail.Make(Surface.Wood,new Color(.32f,.34f,.30f),.10f);
            }
            if(!tree&&rng!=null)
            {
                go.transform.Rotate(0,(float)rng.NextDouble()*360,0);
                go.transform.localScale*=.85f+(float)rng.NextDouble()*.35f;
            }
            var prop=go.AddComponent<RampageProp>();prop.Tree=tree;return prop;
        }
        public void PickUp()
        {
            Available=false;
            foreach(var collider in GetComponentsInChildren<Collider>())collider.enabled=false;
            transform.SetParent(null,true);
        }
        public void Drop(Vector3 p)
        {
            transform.position=p+(Tree?Vector3.zero:Vector3.up*.6f);transform.rotation=Quaternion.identity;
            foreach(var collider in GetComponentsInChildren<Collider>())collider.enabled=true;Available=true;
        }
    }
}
