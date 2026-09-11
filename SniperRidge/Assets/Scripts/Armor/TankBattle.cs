using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    public sealed class TankBattle : MonoBehaviour
    {
        public const float Bounds=220f;
        public const int Stages=5;
        public TankVehicle PlayerTank { get; private set; }
        public int Stage { get; private set; }
        public int AliveTanks { get { int n=0;foreach(var t in tanks)if(t!=null&&!t.IsDead)n++;return n; } }
        public int AliveRockets { get { int n=0;foreach(var e in soldiers)if(e!=null&&!e.IsDead)n++;return n; } }
        public bool Resupplying { get; private set; }
        readonly List<TankVehicle> tanks=new List<TankVehicle>();
        readonly List<EnemySoldier> soldiers=new List<EnemySoldier>();
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
            battle.PlayerTank=TankVehicle.Create(battle,new Vector3(0,TerrainGenerator.FieldElevation+.08f,-150),true,1);
            battle.StartCoroutine(battle.RunStages());
            return battle;
        }
        public static Vector3 Post(int index)
        {
            float angle=(index*60f+25f)*Mathf.Deg2Rad;
            return new Vector3(Mathf.Sin(angle)*95f,TerrainGenerator.FieldElevation,Mathf.Cos(angle)*95f-10f);
        }
        IEnumerator RunStages()
        {
            yield return new WaitForSeconds(3f);
            for(int stage=1;stage<=Stages&&gm.IsPlaying;stage++)
            {
                Stage=stage;Resupplying=false;soldiers.Clear();tanks.Clear();
                int rocketCount=stage<3?4:stage==3?5:6;
                gm.Hud.Announce(string.Format("전차전 {0} / 5 · 로켓병 {1} · 적 전차 {2}",stage,rocketCount,stage-1));
                for(int i=0;i<rocketCount;i++)
                {
                    int slot=(i+stage-1)%6;
                    var position=Post(slot);
                    var soldier=LevelBuilder.SpawnRocketTrooper(gm,position,"AT_"+stage+"_"+i);
                    soldiers.Add(soldier);
                }
                for(int i=0;i<stage-1;i++)
                {
                    Vector3 spawn;
                    while(!TryChooseTankSpawn(i,stage,out spawn))
                    {
                        if(!gm.IsPlaying)yield break;
                        yield return new WaitForSeconds(1f);
                    }
                    var tank=TankVehicle.Create(this,spawn,false,stage);tanks.Add(tank);
                    yield return new WaitForSeconds(1.3f);
                }
                while(gm.IsPlaying&&(AliveTanks>0||AliveRockets>0))yield return new WaitForSeconds(.4f);
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
            // Clear terrain lanes are reserved at the outer ring; choose away from the player.
            Physics.SyncTransforms();
            for(int attempt=0;attempt<64;attempt++)
            {
                float angle=(ordinal*82+stage*31+attempt*37)*Mathf.Deg2Rad;
                var p=new Vector3(Mathf.Sin(angle)*170,TerrainGenerator.FieldElevation+.1f,Mathf.Cos(angle)*170);
                if(Vector3.Distance(p,PlayerTank.transform.position)<65)continue;
                bool free=true;
                foreach(var t in tanks)if(t!=null&&Vector3.Distance(p,t.transform.position)<15)free=false;
                if(free && !Physics.CheckBox(p+Vector3.up*1.7f,new Vector3(2.3f,1.5f,4.1f),Quaternion.identity,
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
                playerShotAt=Time.time;playerCannon.clip=clip;playerCannon.volume=.82f;playerCannon.Play();
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
