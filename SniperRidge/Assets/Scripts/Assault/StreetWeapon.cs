using UnityEngine;
using UnityEngine.AI;

namespace SniperRidge
{
    // Movable street objects stay outside static batching and the permanent navigation bake.
    public sealed class StreetWeapon : MonoBehaviour
    {
        public enum PropKind { Barrel, Pole, Car }
        public PropKind Kind { get; private set; }
        public bool Available=>!held&&!flying&&!spent&&(!vehicle||!vehicle.Destroyed);
        public bool Throwable=>Kind!=PropKind.Pole;
        DestructibleVehicle vehicle;
        Vector3 carCentre;
        Quaternion parkedRotation;
        public Vector3 LiftOrigin { get; private set; }
        float grabbedAt;
        public float LiftBlend=>Mathf.SmoothStep(0,1,(Time.time-grabbedAt)/.4f);
        Collider[] carColliders;
        public bool Flying=>flying;
        public bool Uprooted { get; private set; }
        bool held,flying,spent;
        Vector3 velocity;
        float flightAge;
        Collider solid;
        NavMeshObstacle obstacle;
        static Material red,steel,concrete,ceramic;
        public static StreetWeapon Create(Transform parent,Vector3 point,PropKind kind)
        {
            if(!red){red=SurfaceDetail.Make(Surface.PaintedMetal,new Color(.62f,.035f,.022f),.28f,.35f);
                steel=SurfaceDetail.Make(Surface.Steel,new Color(.16f,.17f,.18f),.32f,.65f);
                concrete=SurfaceDetail.Make(Surface.Wood,new Color(.30f,.22f,.13f),.10f,0);
                ceramic=ProceduralAssets.LitMaterial(new Color(.66f,.71f,.69f),.2f);}
            var root=new GameObject(kind==PropKind.Barrel?"Red throwable barrel":"Uprootable utility pole");
            root.transform.SetParent(parent,false);root.transform.position=point;
            var item=root.AddComponent<StreetWeapon>();item.Kind=kind;
            if(kind==PropKind.Barrel)
            {
                Part(root.transform,"Red steel drum",new Vector3(0,.60f,0),new Vector3(.75f,.60f,.75f),red,PrimitiveType.Cylinder);
                foreach(float y in new[]{.05f,.30f,.88f,1.16f})Part(root.transform,"Rolled drum rib",new Vector3(0,y,0),new Vector3(.79f,.027f,.79f),steel,PrimitiveType.Cylinder);
                Part(root.transform,"Fill cap",new Vector3(.18f,1.215f,0),new Vector3(.09f,.015f,.09f),steel,PrimitiveType.Cylinder);
                var c=root.AddComponent<CapsuleCollider>();c.radius=.4f;c.height=1.23f;c.center=Vector3.up*.6f;item.solid=c;
            }
            else
            {
                Part(root.transform,"Timber pole",Vector3.up*3.5f,new Vector3(.32f,3.5f,.32f),concrete,PrimitiveType.Cylinder);
                Part(root.transform,"Cross arm",new Vector3(0,6.3f,0),new Vector3(1.5f,.14f,.16f),steel);
                foreach(float x in new[]{-.6f,0,.6f})for(int i=0;i<3;i++)Part(root.transform,"Insulator",new Vector3(x,6.45f+i*.08f,0),new Vector3(.16f,.025f,.16f),ceramic,PrimitiveType.Cylinder);
                var c=root.AddComponent<CapsuleCollider>();c.radius=.18f;c.height=7;c.center=Vector3.up*3.5f;item.solid=c;
            }
            item.obstacle=root.AddComponent<NavMeshObstacle>();item.obstacle.shape=NavMeshObstacleShape.Capsule;
            item.obstacle.radius=kind==PropKind.Barrel?.43f:.23f;item.obstacle.height=kind==PropKind.Barrel?1.3f:7;
            item.obstacle.center=Vector3.up*item.obstacle.height*.5f;item.obstacle.carving=true;
            return item;
        }
        public static void AttachCar(DestructibleVehicle car)
        {
            var item=car.gameObject.AddComponent<StreetWeapon>();item.Kind=PropKind.Car;item.vehicle=car;
            item.carCentre=car.GetComponent<MeshFilter>().sharedMesh.bounds.center;
            item.carColliders=car.GetComponentsInChildren<Collider>();
            item.obstacle=car.gameObject.AddComponent<NavMeshObstacle>();item.obstacle.shape=NavMeshObstacleShape.Box;
            item.obstacle.center=item.carCentre;item.obstacle.size=car.GetComponent<MeshFilter>().sharedMesh.bounds.size;
            item.obstacle.carving=true;
        }
        void CarCollisions(bool enabled){obstacle.enabled=enabled;foreach(var c in carColliders)if(c)c.enabled=enabled;}
        public Vector3 PickupPoint(Vector3 origin)
        {
            if(Kind!=PropKind.Car)return transform.position+Vector3.up*.7f;
            return GetComponent<Collider>().bounds.ClosestPoint(origin);
        }
        static void Part(Transform parent,string name,Vector3 position,Vector3 scale,Material material,PrimitiveType primitive=PrimitiveType.Cube)
        {
            var go=GameObject.CreatePrimitive(primitive);go.name=name;go.transform.SetParent(parent,false);go.transform.localPosition=position;go.transform.localScale=scale;
            var c=go.GetComponent<Collider>();c.enabled=false;Destroy(c);go.GetComponent<Renderer>().sharedMaterial=material;
        }
        public bool Grab()
        {
            if(!Available)return false;
            held=true;
            if(vehicle){parkedRotation=transform.rotation;LiftOrigin=transform.position;grabbedAt=Time.time;vehicle.SetCarried(true);CarCollisions(false);}
            else {solid.enabled=false;obstacle.enabled=false;}
            var rb=GetComponent<Rigidbody>();if(rb){rb.isKinematic=true;rb.detectCollisions=false;}
            return true;
        }
        public void Uproot(){Uprooted=true;Effects.Dust(transform.position,Vector3.up,1.2f);}
        public void Drop()
        {
            if(!held)return;held=false;
            transform.SetParent(GameManager.Instance.Assault.transform,true);
            if(vehicle)
            {
                var gm=GameManager.Instance;var p=gm.Player.transform.position+gm.Player.transform.forward*5;
                p=GroundPosition(p);
                transform.SetPositionAndRotation(p,parkedRotation);CarCollisions(true);vehicle.SetCarried(false);return;
            }
            solid.enabled=true;
            var rb=GetComponent<Rigidbody>();if(!rb)rb=gameObject.AddComponent<Rigidbody>();
            rb.isKinematic=false;rb.detectCollisions=true;rb.mass=Kind==PropKind.Barrel?60:140;rb.drag=.3f;rb.angularDrag=.8f;
            rb.collisionDetectionMode=CollisionDetectionMode.ContinuousDynamic;
        }
        public void Throw(Vector3 direction)
        {
            if(!held||!Throwable)return;
            held=false;flying=true;transform.SetParent(GameManager.Instance.Assault.transform,true);
            velocity=direction.normalized*25+Vector3.up*5;flightAge=0;
        }
        void Update()
        {
            var gm=GameManager.Instance;if(!flying||!gm||!gm.IsPlaying)return;
            float dt=Time.deltaTime;flightAge+=dt;
            Vector3 centre=Kind==PropKind.Car?transform.TransformPoint(carCentre):transform.TransformPoint(0,.6f,0);
            Vector3 move=velocity*dt+Vector3.down*(4.905f*dt*dt);velocity+=Vector3.down*(9.81f*dt);
            // Held models are on IgnoreRaycast; the sweep cannot hit the thrower's own mesh.
            if(Physics.SphereCast(centre,Kind==PropKind.Car?1.15f:.42f,move.normalized,out var hit,move.magnitude,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))
            {Detonate(hit.point+hit.normal*.45f,hit.normal);return;}
            transform.position+=move;transform.Rotate(new Vector3(110,35,50)*dt,Space.Self);
            if(flightAge>8)Detonate(transform.position);
        }
        Vector3 GroundPosition(Vector3 p)
        {
            // Use the actual road/roof surface, not the terrain buried beneath the city.
            var hits=Physics.RaycastAll(p+Vector3.up*4,Vector3.down,150,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore);
            System.Array.Sort(hits,(a,b)=>a.distance.CompareTo(b.distance));
            foreach(var hit in hits)
            {
                if(hit.collider.transform.IsChildOf(transform)||hit.collider.GetComponentInParent<SniperController>()||hit.collider.GetComponentInParent<EnemySoldier>())continue;
                p.y=hit.point.y+.05f;return p;
            }
            p.y=TerrainGenerator.GroundHeight(GameManager.Instance.Terrain,p.x,p.z)+.05f;return p;
        }
        void Detonate(Vector3 point,Vector3 normal=default)
        {
            if(spent)return;spent=true;flying=false;
            ExplosionDamage.Detonate(point,Kind==PropKind.Car?420:240,transform.position,null,Kind==PropKind.Car?"자동차":"드럼통");
            foreach(var car in FindObjectsOfType<DestructibleVehicle>())
                if(car!=vehicle&&!car.Destroyed&&Vector3.Distance(car.GetComponent<Renderer>().bounds.ClosestPoint(point),point)<5&&
                    (!EnemyProjectile.WorldHit(point,car.GetComponent<Renderer>().bounds.center,null,out var wall)||wall.collider.GetComponentInParent<DestructibleVehicle>()==car))
                    car.Punch(car.GetComponent<Collider>().bounds.ClosestPoint(point),(car.transform.position-point).normalized);
            if(vehicle)
            {
                transform.rotation=Quaternion.Euler(0,transform.eulerAngles.y,0);
                Vector3 lateral=Vector3.ProjectOnPlane(normal,Vector3.up).normalized;
                Vector3 local=transform.InverseTransformDirection(lateral);
                var extent=GetComponent<MeshFilter>().sharedMesh.bounds.extents;
                float clearance=Mathf.Abs(local.x)*extent.x+Mathf.Abs(local.z)*extent.z;
                transform.position=GroundPosition(point+lateral*(clearance+.1f)-Vector3.ProjectOnPlane(transform.TransformVector(carCentre),Vector3.up));
                while(!vehicle.Destroyed)vehicle.Punch(point,velocity.normalized);
                vehicle.SetCarried(false);CarCollisions(true);
            }
            else Destroy(gameObject);
        }
    }
}
