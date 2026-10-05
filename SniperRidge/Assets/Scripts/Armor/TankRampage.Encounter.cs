using System.Collections.Generic;
using System.Linq;
using UnityEngine;
namespace SniperRidge
{
    public sealed partial class TankRampage
    {
        readonly List<EnemySoldier> infantry=new List<EnemySoldier>();
        public IReadOnlyList<EnemySoldier> Infantry=>infantry;
        public int AliveInfantry=>infantry.Count(e=>e&&!e.IsDead);
        int infantryWaves;
        float nextInfantry;
        public bool Interact()
        {
            if(!CanAct())return false;
            var incoming=battle.Enemies.Where(t=>t&&!t.IsDead&&t.IsCharging&&Vector3.Dot(t.transform.forward,(GM.Player.transform.position-t.transform.position).normalized)>.4f&&Vector3.Distance(t.transform.position,GM.Player.transform.position)<11)
                .OrderBy(t=>Vector3.Distance(t.transform.position,GM.Player.transform.position)).FirstOrDefault();
            if(incoming){if(Held)DropHeld();return StartTankAction(incoming,true,true);}
            if(Held)return ThrowHeld();
            var nearby=FindObjectsOfType<RampageProp>().Any(p=>p.Available&&Vector3.Distance(p.transform.position,GM.Player.transform.position)<3.5f);
            if(nearby)return GrabNearest();
            if(ClimbNearest())return true;
            return GrabNearest();
        }
        void UpdateInfantry()
        {
            if(!CombatReady){nextInfantry=Time.time+7;return;}
            if(infantryWaves>=3||Time.time<nextInfantry||AliveInfantry>8||battle.AliveTanks==0)return;
            SpawnInfantryWave();nextInfantry=Time.time+28;
        }
        public void SpawnInfantryWave()
        {
            if(!CombatReady||infantryWaves>=3)return;
            int spawned=0;
            for(int i=0;i<48&&spawned<6;i++)
            {
                float angle=(i*137.5f+infantryWaves*45)*Mathf.Deg2Rad;
                Vector3 p=Ground(GM.Player.transform.position+new Vector3(Mathf.Sin(angle),0,Mathf.Cos(angle))*(28+i%3*6));
                if(Mathf.Abs(p.x)>TankBattle.Bounds-5||Mathf.Abs(p.z)>TankBattle.Bounds-5)continue;
                if(Physics.CheckCapsule(p+Vector3.up*.6f,p+Vector3.up*2,.6f,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))continue;
                var enemy=LevelBuilder.SpawnRusher(GM,new Vector2(p.x,p.z),"Armored battle infantry "+infantryWaves+"-"+spawned);
                infantry.Add(enemy);spawned++;
            }
            if(spawned>0){infantryWaves++;GM.Hud.Announce("적 보병 "+spawned+"명 접근 · 주먹·충격파·나무로 반격하세요");}
        }
    }
}
