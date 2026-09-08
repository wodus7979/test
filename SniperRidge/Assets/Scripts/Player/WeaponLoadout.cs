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
                Zero = definition.HasZeroing ? 300 : 100;
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
        public void Reset(WeaponDefinition primary)
        {
            Primary = new Slot(primary);
            Rocket = new Slot(WeaponDefinition.Launcher);
            Active = Primary;
        }
        public void Toggle() => Active = Active == Primary ? Rocket : Primary;
    }
}
