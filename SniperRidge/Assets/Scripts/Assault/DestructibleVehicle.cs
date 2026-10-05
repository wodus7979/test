using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    // Each vehicle owns its dents and damage properties; other copies retain the source mesh.
    public sealed class DestructibleVehicle : MonoBehaviour
    {
        public const int PunchesToDestroy=5;
        public int Hits { get; private set; }
        public bool Destroyed => Hits>=PunchesToDestroy;
        public bool Burning => burn && burn.Burning;
        public bool Smoking => burn && burn.Smoking;
        public bool Reacting => reactionAge<.55f;
        Mesh dented;
        VehicleBurnVfx burn;
        MeshRenderer body;
        MaterialPropertyBlock damage;
        Vector3 restingPosition,impulse;
        Quaternion restingRotation;
        float reactionAge=1,burnAge;
        bool carried;
        public void SetCarried(bool value)
        {
            carried=value;reactionAge=1;restingPosition=transform.position;restingRotation=transform.rotation;
        }
        void Awake()
        {
            body=GetComponent<MeshRenderer>();damage=new MaterialPropertyBlock();
            restingPosition=transform.position;restingRotation=transform.rotation;
        }
        public static bool PunchNearest(Vector3 origin,Vector3 forward,float range)
        {
            DestructibleVehicle best=null;Vector3 contact=default;float distance=range;
            var seen=new HashSet<DestructibleVehicle>();
            foreach(var col in Physics.OverlapSphere(origin,range,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))
            {
                var car=col.GetComponentInParent<DestructibleVehicle>();
                if(!car||car.Destroyed||!seen.Add(car))continue;
                Vector3 target=col.bounds.ClosestPoint(origin),delta=target-origin;
                float d=delta.magnitude;
                if(d>distance||Vector3.Dot(forward,Vector3.ProjectOnPlane(col.bounds.center-origin,Vector3.up).normalized)<.5f)continue;
                // Aim just inside the visible hull. Bounds are used only for distance, never for occlusion.
                Vector3 rayTarget=col.bounds.center;
                var hits=Physics.RaycastAll(origin,rayTarget-origin,range,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore);
                System.Array.Sort(hits,(a,b)=>a.distance.CompareTo(b.distance));
                bool visible=false;
                foreach(var hit in hits)
                {
                    if(hit.collider.GetComponentInParent<SniperController>())continue;
                    visible=hit.collider.GetComponentInParent<DestructibleVehicle>()==car;
                    if(visible)target=hit.point;
                    break;
                }
                if(!visible)continue;
                best=car;contact=target;distance=d;
            }
            if(!best)return false;
            best.Punch(contact,forward);return true;
        }
        public void Punch(Vector3 contact,Vector3 direction)
        {
            if(Destroyed)return;
            if(Hits==0){restingPosition=transform.position;restingRotation=transform.rotation;}
            Hits++;
            Vector3 localContact=transform.InverseTransformPoint(contact);
            body.GetPropertyBlock(damage);
            damage.SetVector("_Hit"+(Hits-1),new Vector4(localContact.x,localContact.y,localContact.z,.9f));
            damage.SetFloat("_Damage",Hits/(float)PunchesToDestroy);body.SetPropertyBlock(damage);
            reactionAge=0;impulse=Vector3.ProjectOnPlane(direction,Vector3.up).normalized;
            CombatVfx.Impact(contact,-direction.normalized,.65f,new Color(.32f,.29f,.24f));
            var filter=GetComponent<MeshFilter>();
            if(!dented){dented=Instantiate(filter.sharedMesh);dented.name=name+" damaged hull";filter.sharedMesh=dented;}
            Vector3 point=transform.InverseTransformPoint(contact),push=transform.InverseTransformDirection(direction).normalized;
            var vertices=dented.vertices;
            for(int i=0;i<vertices.Length;i++)
            {
                float influence=Mathf.Clamp01(1-Vector3.Distance(vertices[i],point)/1.35f);
                if(vertices[i].y>.38f)vertices[i]+=push*(influence*influence*.16f);
                if(Destroyed&&vertices[i].y>.48f)vertices[i].y=.48f+(vertices[i].y-.48f)*.52f;
            }
            dented.vertices=vertices;dented.RecalculateNormals();dented.RecalculateTangents();dented.RecalculateBounds();
            var hull=GetComponent<MeshCollider>();if(hull){hull.sharedMesh=null;hull.sharedMesh=dented;}
            if(Hits>=2)
            {
                if(!burn)burn=VehicleBurnVfx.Create(transform,dented.bounds);
                burn.SetDamage(Hits,dented.bounds);
            }
            if(!Destroyed)return;
            foreach(var sign in GetComponentsInChildren<TextMesh>())sign.gameObject.SetActive(false);
            Vector3 center=body.bounds.center;
            CombatVfx.Explosion(center,1.25f);
            var gm=GameManager.Instance;if(gm)gm.PlaySound(gm.Sounds.RocketExplosion,.8f);
        }
        void Update()
        {
            if(Reacting&&!carried)
            {
                reactionAge+=Time.deltaTime;float wave=Mathf.Sin(reactionAge*29)*Mathf.Exp(-reactionAge*8);
                Vector3 local=Quaternion.Inverse(restingRotation)*impulse;
                transform.SetPositionAndRotation(restingPosition+impulse*(wave*.065f),restingRotation*Quaternion.Euler(local.z*wave*2.4f,0,-local.x*wave*2.4f));
                if(!Reacting)transform.SetPositionAndRotation(restingPosition,restingRotation);
            }
            if(Destroyed&&burnAge<3)
            {burnAge+=Time.deltaTime;damage.SetFloat("_Destroyed",Mathf.SmoothStep(0,1,burnAge/3));body.SetPropertyBlock(damage);}
        }
        void OnDestroy(){if(dented)Destroy(dented);}
    }
}
