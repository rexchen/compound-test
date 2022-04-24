const { expect } = require('chai');
const { ethers } = require('hardhat');
const BigNumber = ethers.BigNumber;

describe('Compound test', () => {
  let operator;
  let borrower;
  let comptrollerContract;
  let interestRateModelContract;
  let testErc20Contract;
  let cErc20DelegateContract;
  let erc20Contract;
  let priceOracleContract;
  let cETHContract;

  const deployComptroller = async () => {
    const ComptrollerFactory = await ethers.getContractFactory('Comptroller');
    comptrollerContract = await ComptrollerFactory.deploy();
    await comptrollerContract.deployed();
  };

  const deployInterestRateModel = async () => {
    const InterestRateModelFactory = await ethers.getContractFactory('WhitePaperInterestRateModel');
    interestRateModelContract = await InterestRateModelFactory.deploy(
      ethers.utils.parseUnits('0', 18),
      ethers.utils.parseUnits('0', 18)
    );
    await interestRateModelContract.deployed();
  };

  const deployTestErc20 = async () => {
    const TestErc20Factory = await ethers.getContractFactory('TestErc20');
    testErc20Contract = await TestErc20Factory.deploy();
    await testErc20Contract.deployed();
  };

  const deployCErc20Delegate = async () => {
    const CErc20DelegateFactory = await ethers.getContractFactory('CErc20Delegate');
    cErc20DelegateContract = await CErc20DelegateFactory.deploy();
    await cErc20DelegateContract.deployed();
  };

  const deployCErc20 = async () => {
    const CErc20Factory = await ethers.getContractFactory('CErc20Delegator');
    erc20Contract = await CErc20Factory.deploy(
      testErc20Contract.address,
      comptrollerContract.address,
      interestRateModelContract.address,
      ethers.utils.parseUnits('1', 18),
      'Compound Test ERC20',
      'cErc20',
      1,
      operator.address,
      cErc20DelegateContract.address,
      []
    );
    await erc20Contract.deployed();
  };

  const deployCETH = async () => {
    const CETHFactory = await ethers.getContractFactory('CEther');
    cETHContract = await CETHFactory.deploy(
      comptrollerContract.address,
      interestRateModelContract.address,
      ethers.utils.parseUnits('1', 18),
      'Compound ETH',
      'cETH',
      18,
      operator.address
    );
    await cETHContract.deployed();
  };

  const deployPriceOracle = async () => {
    const PriceOracleFactory = await ethers.getContractFactory('SimplePriceOracle');
    priceOracleContract = await PriceOracleFactory.deploy();
    await priceOracleContract.deployed();
  };

  const supportMarket = async (cTokenAddress, cETHAddress) => {
    await comptrollerContract._supportMarket(cTokenAddress);
    await comptrollerContract._supportMarket(cETHAddress);
  };

  beforeEach(async () => {
    accounts = await ethers.getSigners();
    operator = accounts[0];
    borrower = accounts[1];
    await deployComptroller();
    await deployInterestRateModel();
    await deployTestErc20();
    await deployCErc20Delegate();
    await deployCErc20();
    await deployCETH();
    await deployPriceOracle();

    await supportMarket(erc20Contract.address, cETHContract.address);
    await testErc20Contract.approve(erc20Contract.address, ethers.utils.parseUnits('100000', 18));
    await testErc20Contract.connect(borrower).approve(erc20Contract.address, ethers.utils.parseUnits('100000', 18));

    await priceOracleContract.setDirectPrice(testErc20Contract.address, ethers.utils.parseUnits('10', 18));
    await comptrollerContract._setPriceOracle(priceOracleContract.address);
    await comptrollerContract._setCollateralFactor(erc20Contract.address, ethers.utils.parseUnits('0.5', 18));
    await comptrollerContract._setCollateralFactor(cETHContract.address, ethers.utils.parseUnits('0.5', 18));
  });

  it('mint and redeem', async () => {
    await erc20Contract.mint(1);

    let cBalance = await erc20Contract.balanceOf(operator.address);
    expect(cBalance).to.be.equal(BigNumber.from('1'));

    await erc20Contract.redeem(1);
    cBalance = await erc20Contract.balanceOf(operator.address);
    expect(cBalance).to.be.equal(BigNumber.from('0'));
  });

  it('borrow and repay', async () => {
    await erc20Contract.mint(10000);

    const underlyingBalanceBefore = await testErc20Contract.balanceOf(operator.address);
    await erc20Contract.borrow(1);
    const underlyingBalanceAfter = await testErc20Contract.balanceOf(operator.address);

    expect(underlyingBalanceAfter.sub(underlyingBalanceBefore)).to.be.equal('1');

    await erc20Contract.repayBorrow(1);

    expect(await testErc20Contract.balanceOf(operator.address)).to.be.equal(underlyingBalanceBefore);
  });

  it('collateralize and liquidate', async () => {
    await erc20Contract.mint(ethers.utils.parseUnits('100', 18));
    await cETHContract.connect(borrower).mint({ value: ethers.utils.parseUnits('100', 18) });
    await comptrollerContract.connect(borrower).enterMarkets([cETHContract.address]);

    await erc20Contract.connect(borrower).borrow(ethers.utils.parseUnits('10000', 18));
    await priceOracleContract.setDirectPrice(testErc20Contract.address, ethers.utils.parseUnits('100000', 18));

    await erc20Contract.liquidateBorrow(borrower.address, ethers.utils.parseUnits('10000', 18), cETHContract.address);
  });
});
