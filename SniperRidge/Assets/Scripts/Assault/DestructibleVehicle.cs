using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    // A placed car owns its dents and wreck materials; other copies retain the source mesh.
    public sealed class DestructibleVehicle : MonoBehaviour
    {
        public const int PunchesToDestroy=5;
        public int Hits { get; private set; }
        public bool Destroyed => Hits>=PunchesToDestroy;
        public bool Burning => fire && fire.isPlaying;
        Mesh dented;
        Material[] wreckMaterials;
        ParticleSystem fire;
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
            Hits++;
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
            dented.vertices=vertices;dented.RecalculateNormals();dented.RecalculateBounds();
            var hull=GetComponent<MeshCollider>();if(hull){hull.sharedMesh=null;hull.sharedMesh=dented;}
            if(!Destroyed)return;
            var renderer=GetComponent<MeshRenderer>();var original=renderer.sharedMaterials;
            wreckMaterials=new Material[original.Length];
            for(int i=0;i<original.Length;i++)
            {var m=new Material(original[i]);m.color=Color.Lerp(m.color,new Color(.045f,.038f,.03f),.84f);if(m.HasProperty("_Glossiness"))m.SetFloat("_Glossiness",.06f);if(m.HasProperty("_Destroyed"))m.SetFloat("_Destroyed",1);if(m.HasProperty("_EmissionColor"))m.SetColor("_EmissionColor",Color.black);wreckMaterials[i]=m;}
            renderer.sharedMaterials=wreckMaterials;
            foreach(var sign in GetComponentsInChildren<TextMesh>())sign.gameObject.SetActive(false);
            Vector3 center=renderer.bounds.center;
            CombatVfx.Explosion(center,1.25f);
            var gm=GameManager.Instance;if(gm)gm.PlaySound(gm.Sounds.RocketExplosion,.8f);
            fire=MakeParticles("Wreck fire",center,CombatVfx.FireMaterial,false);
            MakeParticles("Wreck smoke",center+Vector3.up*.5f,CombatVfx.SmokeMaterial,true);
        }
        ParticleSystem MakeParticles(string label,Vector3 position,Material material,bool smoke)
        {
            var go=new GameObject(label);go.transform.SetParent(transform);go.transform.position=position;
            var ps=go.AddComponent<ParticleSystem>();ps.Stop(true,ParticleSystemStopBehavior.StopEmittingAndClear);
            var main=ps.main;main.loop=true;main.duration=3;main.startLifetime=smoke?new ParticleSystem.MinMaxCurve(3,5):new ParticleSystem.MinMaxCurve(.5f,1.1f);
            main.startSpeed=smoke?new ParticleSystem.MinMaxCurve(1.5f,2.4f):new ParticleSystem.MinMaxCurve(.6f,1.7f);
            main.startSize=smoke?new ParticleSystem.MinMaxCurve(.7f,1.4f):new ParticleSystem.MinMaxCurve(.55f,1.25f);
            main.startRotation=new ParticleSystem.MinMaxCurve(0,Mathf.PI*2);main.simulationSpace=ParticleSystemSimulationSpace.World;main.maxParticles=smoke?90:65;
            var emission=ps.emission;emission.rateOverTime=smoke?15:38;
            var shape=ps.shape;shape.shapeType=ParticleSystemShapeType.Cone;shape.angle=12;shape.radius=smoke?.45f:.65f;shape.rotation=new Vector3(-90,0,0);
            var colors=ps.colorOverLifetime;colors.enabled=true;var gradient=new Gradient();
            gradient.SetKeys(new[]{new GradientColorKey(smoke?new Color(.08f,.075f,.065f):new Color(1,.8f,.25f),0),new GradientColorKey(smoke?new Color(.2f,.19f,.18f):new Color(1,.15f,.015f),1)},new[]{new GradientAlphaKey(0,0),new GradientAlphaKey(smoke?.55f:.9f,.12f),new GradientAlphaKey(0,1)});colors.color=gradient;
            var size=ps.sizeOverLifetime;size.enabled=true;size.size=new ParticleSystem.MinMaxCurve(1,AnimationCurve.Linear(0,smoke?.5f:1,1,smoke?2.5f:.1f));
            var velocity=ps.velocityOverLifetime;velocity.enabled=true;velocity.space=ParticleSystemSimulationSpace.World;velocity.y=new ParticleSystem.MinMaxCurve(smoke?1.1f:.9f);
            var r=ps.GetComponent<ParticleSystemRenderer>();r.sharedMaterial=material;r.sortMode=ParticleSystemSortMode.Distance;r.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;
            ps.Play();return ps;
        }
        void OnDestroy(){if(dented)Destroy(dented);if(wreckMaterials!=null)foreach(var m in wreckMaterials)if(m)Destroy(m);}
    }
}
