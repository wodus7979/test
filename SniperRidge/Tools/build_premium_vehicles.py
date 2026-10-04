"""Original reference-inspired road vehicles. Reuses the measured sedan wheel/chassis tooling."""
from build_urban_vehicles import Model,build,ROOT
import numpy as np
import json,math

def wheels(m,width,axles,scale=1):
    for side in [-1,1]:
        for axle in axles:
            start=len(m.parts);m.tire(side*.91,0)
            for p in m.parts[start:]:
                v=np.array(p['positions']).reshape(-1,3)
                v[:,0]=(v[:,0]-side*.91)*scale+side*width
                v[:,1]=(v[:,1]-.2)*scale+.2+(scale-1)*.38
                v[:,2]=v[:,2]*scale+axle;p['positions']=v.round(6).ravel().tolist()

def sedan():
    m=build(False)
    m.parts=[p for p in m.parts if not any(n in p['name'] for n in ['Headlight lens','Grille'])]
    m.box('Deep grille opening','black',(0,.60,2.206),(1.02,.32,.035))
    for y in [.448,.756]:m.tube('Chrome grille surround','metal',(-.5,y,2.236),(.5,y,2.236),.018,12)
    for side in [-1,1]:
        m.tube('Chrome grille edge','metal',(side*.5,.45,2.236),(side*.5,.75,2.236),.018,12)
        points=[(side*.48,.71,2.238),(side*.88,.77,2.146),(side*.88,.60,2.146),(side*.52,.60,2.238)]
        m.panel('Swept headlamp dark lens','glass',points,(0,0,1))
        m.tube('LED daytime running light','light',(side*.50,.70,2.251),(side*.86,.75,2.162),.014,8)
        for x in [.62,.77]:m.tube('Headlight projector','metal',(side*x,.655,2.22),(side*x,.655,2.25),.047,20)
        for z in np.linspace(-.6,.3,3):m.box('Chrome belt detail','metal',(side*.868,.898,z),(.023,.024,.8))
        m.tube('Hood crease','paint',(side*.42,.827,.97),(side*.51,.75,1.82),.01,8)
    for y in np.linspace(.49,.715,5):m.tube('Polished grille slat','metal',(-.47,y,2.24),(.47,y,2.24),.009,10)
    return m

def suv():
    m=build(False)
    remove=['Rounded roof','side glass','windshield','Windshield','Wiper','Door panel','door handle','Window belt','Mirror','Grille']
    m.parts=[p for p in m.parts if not any(n in p['name'] for n in remove)]
    m.loft('Upright SUV cabin','paint',[(-1.94,.85,.81,1.71),(-1.80,.87,.82,1.94),(.53,.85,.83,1.96),(1.15,.86,.83,1.03)],32)
    # Black pillars and individually inset windows match the upright offroad profile.
    for side in [-1,1]:
        for a,b in [(-1.74,-.83),(-.73,.16),(.25,.84)]:
            topB=1.82 if b<.6 else 1.40
            m.panel('SUV glazing','glass',[(side*.872,1.03,a),(side*.872,1.03,b),(side*.858,topB,b-.03),(side*.858,1.82,a)],(side,0,0))
            m.tube('Door seam','black',(side*.944,.32,a),(side*.944,.88,a),.007)
            m.box('Flush handle','black',(side*.95,.93,a+.17),(.032,.035,.17))
        m.tube('Roof rack rail','black',(side*.65,2.04,-1.61),(side*.65,2.04,.34),.025)
        for z in [-1.5,.18]:m.box('Rack foot','black',(side*.65,1.99,z),(.08,.13,.12))
        m.box('Wing mirror','black',(side*1.03,1.19,.91),(.24,.16,.2))
        m.box('Mirror insert','glass',(side*1.035,1.19,.802),(.19,.115,.013))
        m.box('Running board','black',(side*.98,.30,-.05),(.14,.075,2.1))
    m.panel('SUV windscreen','glass',[(-.76,1.065,1.14),(.76,1.065,1.14),(.74,1.825,.63),(-.74,1.825,.63)],(0,1,1))
    m.panel('SUV rear glass','glass',[(-.72,1.13,-1.955),(-.72,1.72,-1.91),(.72,1.72,-1.91),(.72,1.13,-1.955)],(0,0,-1))
    for z in [-1.45,-.25,.18]:m.tube('Rack crossbar','black',(-.7,2.04,z),(.7,2.04,z),.025)
    m.box('Grille','black',(0,.64,2.216),(1.05,.19,.042))
    for x in np.linspace(-.46,.46,13):m.box('Grille mesh','metal',(x,.64,2.243),(.015,.14,.014))
    m.box('Front skid plate','metal',(0,.3,2.225),(1.18,.14,.035))
    return m

def bus():
    m=Model()
    rings=[]
    for z in np.linspace(-5.25,5.25,151):
        bottom=.22
        for axle in [-3.25,3.05]:
            d=abs(z-axle)
            if d<.63:bottom=max(bottom,.333+math.sqrt(.63**2-d*d))
        rings.append((float(z),1.23-(abs(z)/5.25)**16*.1,bottom,1.24))
    m.loft('Coach lower body with wheel arches','paint',rings,32)
    m.loft('Rounded roof','paint',[(-5.22,1.1,2.79,2.97),(-4.96,1.22,2.86,3.13),(4.67,1.22,2.87,3.13),(5.11,1.07,2.74,3.0)],32)
    m.box('Passenger floor','black',(0,.69,0),(2.28,.14,9.9))
    m.box('Rear engine compartment','paint',(0,1.66,-5.12),(2.26,.9,.16))
    m.panel('Rear window','glass',[(-1.07,2.02,-5.225),(-1.07,2.72,-5.20),(1.07,2.72,-5.20),(1.07,2.02,-5.225)],(0,0,-1))
    m.panel('Panoramic windshield','busglass',[(-1.10,1.20,5.254),(1.10,1.20,5.254),(1.05,2.76,5.10),(-1.05,2.76,5.10)],(0,0,1))
    for side in [-1,1]:
        for a,b in [(-5.04,-3.85),(-3.80,-2.45),(-2.40,-1.05),(-1.0,.35),(.4,1.75),(1.8,3.15),(3.2,4.93)]:
            m.panel('Passenger panoramic glass','busglass',[(side*1.231,1.24,a),(side*1.231,1.24,b),(side*1.211,2.82,b),(side*1.211,2.82,a)],(side,0,0))
            m.box('Window pillar','black',(side*1.229,2.03,a),(.052,1.63,.06))
        m.tube('Window lower seal','black',(side*1.24,1.23,-5.08),(side*1.24,1.23,4.94),.035)
        m.tube('Window upper seal','black',(side*1.217,2.81,-5.08),(side*1.217,2.81,4.94),.04)
        m.box('Body rubbing strip','black',(side*1.237,.56,0),(.035,.10,9.9))
        m.tube('Front A pillar','black',(side*1.12,1.19,5.27),(side*1.08,2.77,5.11),.055)
        m.tube('Mirror arm','black',(side*1.08,2.74,4.93),(side*1.48,2.59,5.1),.035)
        m.box('Mirror body','black',(side*1.49,2.32,5.1),(.15,.54,.19))
        m.box('Mirror glazing','glass',(side*1.49,2.32,4.992),(.11,.47,.012))
        m.box('Front light assembly','black',(side*.83,.65,5.245),(.50,.21,.06))
        for dx in [-.13,.13]:
            m.box('LED headlight','light',(side*.83+dx,.68,5.29),(.18,.083,.035))
        m.box('Tail light','red',(side*1.05,.87,-5.23),(.17,.51,.07))
        for z in [-4.6,-1.5,1.3,4.5]:m.box('Side marker','amber',(side*1.25,.86,z),(.018,.05,.15))
        for z in np.arange(-4.15,2.3,.85):
            x=side*.72
            m.box('Blue passenger cushion','seat',(x,1.04,z),(.68,.14,.55))
            m.box('Passenger seat back','seat',(x,1.39,z-.23),(.70,.66,.13))
            m.tube('Seat frame','metal',(x,.73,z),(x,1.1,z),.028)
        m.tube('Passenger grab rail','rail',(side*.49,2.33,-4.5),(side*.49,2.33,3),.021)
        for z in [-3.4,-.7,2.2]:m.tube('Standing grab pole','rail',(side*.49,.76,z),(side*.49,2.7,z),.024)
    # Two paired doors on the pavement side, each with a full-height black frame.
    for z in [3.83,-.8]:
        for dz in [-.63,0,.63]:m.box('Entrance door upright','black',(1.255,1.61,z+dz),(.065,2.23,.045))
        m.box('Entrance threshold','metal',(1.258,.50,z),(.07,.08,1.31))
        m.box('Door top rail','black',(1.247,2.71,z),(.065,.055,1.31))
    for side in [-1,1]:
        m.tube('Windshield wiper','black',(side*.17,1.24,5.30),(side*.59,2.09,5.21),.017)
        m.tube('Wiper blade','rubber',(side*.48,1.91,5.24),(side*.71,2.37,5.19),.025)
    m.box('Driver dashboard','black',(0,1.19,4.7),(2.08,.19,.65))
    m.box('Driver seat','seat',(-.65,1.22,4.06),(.58,.14,.55))
    m.box('Driver seat back','seat',(-.65,1.55,3.87),(.6,.63,.14))
    for k in range(32):
        a=k*math.pi/16;b=(k+1)*math.pi/16
        m.tube('Steering wheel','rubber',(-.65+.23*math.cos(a),1.55+.08*math.sin(a),4.57+.20*math.sin(a)),(-.65+.23*math.cos(b),1.55+.08*math.sin(b),4.57+.20*math.sin(b)),.019,6)
    m.box('Route display black surround','black',(0,2.86,5.135),(2.09,.34,.07))
    m.box('Front bumper','paint',(0,.4,5.27),(2.23,.19,.14))
    m.box('Plate recess','black',(0,.40,5.35),(.55,.14,.024))
    m.box('Registration plate','plate',(0,.41,5.369),(.46,.095,.015))
    m.box('Roof HVAC','paint',(0,3.21,-.8),(1.58,.24,2.5))
    for x in np.linspace(-.64,.64,12):m.box('HVAC vent','black',(x,3.341,-.8),(.035,.006,1.96))
    for y in np.linspace(.75,1.8,12):m.box('Rear cooling grille','black',(0,y,-5.236),(1.44,.035,.02))
    wheels(m,1.11,[-3.25,3.05],1.35)
    return m

def main():
    out=ROOT/'Assets/Resources/Vehicles'
    for name,model in [('sedan',sedan()),('suv',suv()),('bus',bus())]:
        (out/(name+'.json')).write_text(json.dumps({'parts':model.parts},separators=(',',':')))
        print(name,sum(len(p['triangles'])//3 for p in model.parts),'triangles')
if __name__=='__main__':main()
