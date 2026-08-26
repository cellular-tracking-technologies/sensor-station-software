import sys
RFM={0x01:"OpMode",0x02:"DataModul",0x03:"BitrateMsb",0x04:"BitrateLsb",0x05:"FdevMsb",0x06:"FdevLsb",
0x07:"FrfMsb",0x08:"FrfMid",0x09:"FrfLsb",0x0B:"AfcCtrl",0x11:"PaLevel",0x13:"Ocp",0x18:"Lna",0x19:"RxBw",
0x1A:"AfcBw",0x1E:"AfcFei",0x25:"DioMapping1",0x26:"DioMapping2",0x29:"RssiThresh",
0x2C:"PreambleMsb",0x2D:"PreambleLsb",0x2E:"SyncConfig",0x2F:"SyncValue1",0x30:"SyncValue2",
0x37:"PacketConfig1",0x38:"PayloadLength",0x3C:"FifoThresh",0x3D:"PacketConfig2",0x6F:"TestDagc"}
REGARG=int(sys.argv[2]) if len(sys.argv)>2 else 22
VALARG=int(sys.argv[3]) if len(sys.argv)>3 else 20
buf=open(sys.argv[1],"rb").read()
ldi={}
for a in range(0,len(buf)-1,2):
    w=buf[a]|(buf[a+1]<<8)
    if (w&0xF000)==0xE000:
        ldi[a]=(16+((w>>4)&0x0F), ((w>>4)&0xF0)|(w&0x0F))
rows=[]
for a,(Rd,K) in sorted(ldi.items()):
    if Rd!=REGARG or K not in RFM: continue
    val=None; vat=None
    for back in range(2,14,2):            # nearest preceding ldi r20 (the value)
        p=ldi.get(a-back)
        if p and p[0]==VALARG: val,vat=p[1],a-back; break
    rows.append((a,K,val,vat))
print(f"{'addr':>8} {'reg':>5} {'name':<15} {'value':>6}")
for a,K,val,vat in rows:
    print(f"  0x{a:04x} 0x{K:02X}  {RFM[K]:<15} " + (f"0x{val:02X}" if val is not None else "  ?"))
