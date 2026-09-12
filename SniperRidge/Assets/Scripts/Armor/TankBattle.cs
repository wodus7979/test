using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    public sealed class TankBattle : MonoBehaviour
    {
        public const float Bounds=TankCanyon.CombatBounds;
        public const int Stages=5;
        public TankVehicle PlayerTank { get; private set; }
        public int Stage { get; private set; }
        public int AliveTanks { get { int n=0;foreach(var t in tanks)if(t!=null&&!t.IsDead)n++;return n; } }
        public int AliveK2 { get { int n=0;foreach(var t in tanks)if(t!=null&&!t.IsDead&&t.Appearance==TankAppearance.K2BlackPanther)n++;return n; } }
        public int AliveOpposition { get { int n=0;foreach(var t in tanks)if(t!=null&&!t.IsDead&&t.Appearance==TankAppearance.Opposition)n++;return n; } }
        public bool Resupplying { get; private set; }
        readonly List<TankVehicle> tanks=new List<TankVehicle>();
        readonly List<AudioClip> cannons=new List<AudioClip>();
        AudioClip explosion;
        AudioSource playerCannon;
        float playerShotAt = -10f;
        GameManager gm;
        float nextEnemyCannon;
        public static TankBattle Create(GameManager game)
        {
            var battle=new GameObject("Armored battle").AddComponent<TankBattle>();battle.gm=game;
            for(int i=0;i<3;i++)battle.cannons.Add(Resources.Load<AudioClip>("Audio/tank_cannon"+(i==0?"":"_0"+(i+1))));
            battle.playerCannon=battle.gameObject.AddComponent<AudioSource>();
            battle.playerCannon.playOnAwake=false;battle.playerCannon.spatialBlend=0;battle.playerCannon.priority=24;
            battle.explosion=Resources.Load<AudioClip>("Audio/tank_impact");
            game.Player.AttachToTank(game.Weapon);
            battle.PlayerTank=TankVehicle.Create(battle,TankCanyon.Ground(game.Terrain,TankCanyon.Node(1),.2f),true,1);
            battle.StartCoroutine(battle.RunStages());
            return battle;
        }
        public static Vector3 Post(int index)
        {
            float angle=(index*60f+25f)*Mathf.Deg2Rad;
            return new Vector3(Mathf.Sin(angle)*75f,TerrainGenerator.FieldElevation,Mathf.Cos(angle)*75f-40f);
        }
        public static int EnemyTankCount(int stage)=>4+Mathf.Clamp(stage,1,Stages);
        public static TankAppearance EnemyAppearance(int stage,int ordinal)=>(ordinal+stage)%2==0?TankAppearance.K2BlackPanther:TankAppearance.Opposition;
        IEnumerator RunStages()
        {
            yield return new WaitForSeconds(3f);
            for(int stage=1;stage<=Stages&&gm.IsPlaying;stage++)
            {
                Stage=stage;Resupplying=false;tanks.Clear();
                int tankCount=EnemyTankCount(stage);
                int k2Count=tankCount/2,oppositionCount=tankCount-k2Count;
                gm.Hud.Announce(string.Format("전차전 {0} / 5 · 적 전차 {1}대 · K2 {2} / 주력전차 {3}",stage,tankCount,k2Count,oppositionCount));
                for(int i=0;i<tankCount;i++)
                {
                    if(!gm.IsPlaying)yield break;
                    Vector3 spawn;
                    while(!TryChooseTankSpawn(i,stage,out spawn))
                    {
                        if(!gm.IsPlaying)yield break;
                        yield return new WaitForSeconds(1f);
                    }
                    TankAppearance appearance=EnemyAppearance(stage,i);
                    var tank=TankVehicle.Create(this,spawn,false,stage,appearance);tanks.Add(tank);
                    yield return new WaitForSeconds(1.3f);
                }
                while(gm.IsPlaying&&AliveTanks>0)yield return new WaitForSeconds(.4f);
                if(!gm.IsPlaying)yield break;
                if(stage<Stages)
                {
                    Resupplying=true;PlayerTank.Resupply();
                    gm.Hud.Announce("단계 완료 · 포탄 +25발 / 장갑 수리 +140 · 8초 후 적 증원");
                    yield return new WaitForSeconds(8f);
                }
            }
            if(gm.IsPlaying)gm.CompleteArmoredMission();
        }
        bool TryChooseTankSpawn(int ordinal,int stage,out Vector3 spawn)
        {
            // Sample clear road junctions at their actual elevation, including enlarged colliders.
            Physics.SyncTransforms();
            for(int attempt=0;attempt<TankCanyon.NodeCount*3;attempt++)
            {
                int node=(ordinal*5+stage*3+attempt)%TankCanyon.NodeCount;
                Vector2 offset=attempt<TankCanyon.NodeCount?Vector2.zero:Vector2.right*(attempt<TankCanyon.NodeCount*2?10:-10);
                var p=TankCanyon.Ground(gm.Terrain,TankCanyon.Node(node)+offset,.25f);
                if(TankCanyon.RoadDistance(p.x,p.z)>4||Vector3.Distance(p,PlayerTank.transform.position)<38)continue;
                bool free=true;
                foreach(var t in tanks)if(t!=null&&Vector3.Distance(p,t.transform.position)<18)free=false;
                Vector3 normal=TankCanyon.Normal(gm.Terrain,p);
                Quaternion rotation=Quaternion.FromToRotation(Vector3.up,normal);
                if(free && normal.y>.94f && !Physics.CheckBox(p+normal*2.2f,new Vector3(2.65f,1.8f,5.3f),rotation,
                    EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore)) { spawn=p;return true; }
            }
            spawn=default;return false;
        }
        public bool ReserveEnemyCannon()
        {
            if(Time.time<nextEnemyCannon)return false;
            nextEnemyCannon=Time.time+1.6f;return true;
        }
        public void PlayCannon(Vector3 position,bool player)
        {
            var clip=cannons[Random.Range(0,cannons.Count)];
            float range=Vector3.Distance(gm.PlayerEye.position,position);
            if(player)
            {
                gm.Music.Duck(.9f);playerShotAt=Time.time;playerCannon.clip=clip;playerCannon.volume=.82f;playerCannon.Play();
            }
            else gm.PlaySound(clip,Mathf.Clamp01(1-range/350f)*.28f*(Time.time-playerShotAt<.18f?.4f:1f));
        }
        public void PlayExplosion(Vector3 position)
        {
            float distance=Vector3.Distance(gm.PlayerEye.position,position);
            gm.PlaySound(explosion,Mathf.Clamp01(1-distance/380f)*.32f);
        }
        public void StopBattle()
        {
            StopAllCoroutines();if(PlayerTank!=null)PlayerTank.StopVehicle();
            foreach(var tank in tanks)if(tank!=null)tank.StopVehicle();
        }
    }
}
