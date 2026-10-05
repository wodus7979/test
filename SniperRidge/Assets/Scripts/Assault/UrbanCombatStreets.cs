using UnityEngine;
using UnityEngine.AI;

namespace SniperRidge
{
    public static class UrbanCombatStreets
    {
        // Parallel avenues joined by the existing east/west streets; always leave intersections open.
        public static readonly float[] Avenues={-144,-72,0,72,144};
        public static int LastVehicleCount { get; private set; }
        public static void Vehicles(Transform root,int seed)
        {
            var random=new System.Random(seed);LastVehicleCount=0;
            for(int axis=0;axis<2;axis++)foreach(float street in Avenues)
                for(int block=0;block<4;block++)
                {
                    float along=-108+block*72+random.Next(-12,13);int side=random.Next(2)==0?-1:1;
                    Vector3 point=axis==0?new Vector3(street+side*2.8f,AssaultLayout.Ground,along):new Vector3(along,AssaultLayout.Ground,street+side*2.8f);
                    if(Vector3.Distance(point,AssaultLayout.Start)<18||Vector3.Distance(point,AssaultLayout.BossPosition)<18)continue;
                    bool bus=random.Next(5)==0;float yaw=(axis==0?0:90)+(side<0?180:0);
                    var rotation=Quaternion.Euler(0,yaw,0);var extent=bus?new Vector3(1.38f,1.8f,6.3f):new Vector3(1.1f,1.2f,2.6f);
                    Physics.SyncTransforms();
                    if(Physics.CheckBox(point+Vector3.up*(extent.y+.25f),extent,rotation,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))continue;
                    string kind=bus?"City bus":random.Next(3)==0?"Offroad SUV":"Abandoned sedan";
                    UrbanProps.Place(kind,root,point,yaw);LastVehicleCount++;
                }
        }
        public static void Props(Transform root)
        {
            foreach(float street in Avenues)for(int block=0;block<4;block++)
            {
                float z=-126+block*72;
                foreach(int side in new[]{-1,1})
                {
                    var p=new Vector3(street+side*4.2f,AssaultLayout.Ground,z+side*7);
                    if(Clear(p,.55f,1.4f))StreetWeapon.Create(root,p,StreetWeapon.PropKind.Barrel);
                }
                var pole=new Vector3(street+5.9f,AssaultLayout.Ground,z+15);
                if(Clear(pole,.4f,7))StreetWeapon.Create(root,pole,StreetWeapon.PropKind.Pole);
            }
        }
        static bool Clear(Vector3 p,float radius,float height)=>!Physics.CheckCapsule(p+Vector3.up*(radius+.25f),p+Vector3.up*(height-radius),radius,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore);
        public static void ValidateRoutes()
        {
            foreach(float street in Avenues)
            {
                Require(AssaultLayout.Start,new Vector3(street,AssaultLayout.Ground,-144));
                Require(new Vector3(street,AssaultLayout.Ground,-144),new Vector3(street,AssaultLayout.Ground,144));
                Require(new Vector3(street,AssaultLayout.Ground,144),AssaultLayout.BossPosition);
            }
        }
        static void Require(Vector3 from,Vector3 to)
        {
            var path=new NavMeshPath();
            if(!NavMesh.SamplePosition(from,out var a,3,NavMesh.AllAreas)||!NavMesh.SamplePosition(to,out var b,3,NavMesh.AllAreas)||!NavMesh.CalculatePath(a.position,b.position,NavMesh.AllAreas,path)||path.status!=NavMeshPathStatus.PathComplete)
                throw new System.InvalidOperationException("도시 우회로 차단: "+from+" → "+to);
        }
    }
}
