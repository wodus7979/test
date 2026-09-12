using UnityEngine;

namespace SniperRidge
{
    /// <summary>Mission inventory. Switching only selects a slot; it never replenishes ammunition.</summary>
    public sealed class WeaponLoadout
    {
        public sealed class Slot
        {
            public readonly WeaponDefinition Definition;
            public int Magazine, Reserve, Zoom, Zero;
            public float ReadyAt;
            public Slot(WeaponDefinition definition)
            {
                Definition = definition;
                Magazine = definition.MagSize;
                Reserve = definition.Reserve;
                Zoom = definition.DefaultZoomIndex;
                Zero = 100;
            }
            public int Supply(int rounds)
            {
                int added = Mathf.Clamp(rounds, 0, Definition.Reserve - Reserve);
                Reserve += added;
                return added;
            }
            public void FinishReload()
            {
                int take = Mathf.Min(Definition.MagSize - Magazine, Reserve);
                Magazine += take;
                Reserve -= take;
            }
        }
        public Slot Primary { get; private set; }
        public Slot Rocket { get; private set; }
        public Slot Active { get; private set; }
        Slot[] fpsSlots;
        public void Reset(WeaponDefinition primary)
        {
            Primary = new Slot(primary);
            Rocket = new Slot(WeaponDefinition.Launcher);
            fpsSlots=primary.IsAssault?new[]{Primary,new Slot(WeaponDefinition.Find("lmg")),new Slot(WeaponDefinition.Find("sniper")),Rocket}:null;
            Active = Primary;
        }
        public bool Select(int index)
        {
            if(fpsSlots==null||index<0||index>=fpsSlots.Length||Active==fpsSlots[index])return false;
            Active=fpsSlots[index];if(Active!=Rocket)Primary=Active;return true;
        }
        public int SupplyCombat(int rifle,int machineGun,int sniper,int rockets)
        {
            if(fpsSlots==null)return 0;
            return fpsSlots[0].Supply(rifle)+fpsSlots[1].Supply(machineGun)+fpsSlots[2].Supply(sniper)+fpsSlots[3].Supply(rockets);
        }
        public void Toggle() => Active = Active == Primary ? Rocket : Primary;
    }
}
